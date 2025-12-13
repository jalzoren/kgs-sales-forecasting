# ml-service/main_app.py
from fastapi import FastAPI, BackgroundTasks, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import json
import glob
# Note: forecastModel can perform heavy work at import time (loading models,
# running forecasting). Import it lazily inside the endpoint to avoid
# triggering forecasting during application startup.
import os
from trainModel import ProductForecasterPipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TrainRequest(BaseModel):
    user_id: str

class EvaluateRequest(BaseModel):
    user_id: str
    forecast_json_path: Optional[str] = None  # Optional, uses latest if not provided

# In-memory store (for demo) - in production use Redis/DB
training_status = {}

@app.post("/api/train")
async def start_training(request: TrainRequest, background_tasks: BackgroundTasks):
    user_id = request.user_id

    if training_status.get(user_id) == "running":
        raise HTTPException(400, detail="Training already in progress")

    training_status[user_id] = "running"

    def run_training():
        try:
            pipeline = ProductForecasterPipeline(user_id)
            pipeline.run()

            # Save final result
            training_status[user_id] = {
                "status": "completed",
                "message": "Model training completed successfully!",
                "timestamp": __import__("datetime").datetime.now().isoformat()
            }
        except Exception as e:
            training_status[user_id] = {
                "status": "failed",
                "message": f"Training failed: {str(e)}",
                "timestamp": __import__("datetime").datetime.now().isoformat()
            }

    background_tasks.add_task(run_training)
    return {"status": "started", "message": "Training started in background"}

@app.get("/api/training-status/{user_id}")
async def get_status(user_id: str):
    status = training_status.get(user_id, {"status": "none"})
    return status

@app.get("/api/metrics/{user_id}")
async def get_all_metrics(user_id: str):
    """
    Returns the full training evaluation metrics for a given user.
    Metrics come from the consolidated report CSV.
    """
    report_path = os.path.join("reports", f"user_{user_id}_training_report.csv")

    if not os.path.exists(report_path):
        raise HTTPException(404, detail="No evaluation report found. Train the model first.")

    df = pd.read_csv(report_path)

    return {
        "user_id": user_id,
        "total_products": len(df),
        "metrics": df.to_dict(orient="records")
    }


@app.get("/api/metrics/{user_id}/{product_id}")
async def get_metrics_by_product(user_id: str, product_id: str):
    """
    Returns metrics only for the specified product ID.
    """
    report_path = os.path.join("reports", f"user_{user_id}_training_report.csv")

    if not os.path.exists(report_path):
        raise HTTPException(404, detail="No evaluation report found. Train the model first.")

    df = pd.read_csv(report_path)

    # Convert product_id to match type in CSV (may be int or str)
    df["Product_ID"] = df["Product_ID"].astype(str)
    matching = df[df["Product_ID"] == str(product_id)]

    if matching.empty:
        raise HTTPException(404, detail=f"No metrics found for Product_ID {product_id}")

    return matching.to_dict(orient="records")[0]

@app.get("/api/forecast/{user_id}")
async def api_get_forecast(user_id: str):
    # 1) Check for existing cached JSON forecast to avoid re-running heavy work
    try:
        svc_dir = os.path.dirname(os.path.abspath(__file__))
        user_forecast_dir = os.path.normpath(
            os.path.join(svc_dir, "..", "backend", "files", "forecastData", f"user_{user_id}")
        )

        if os.path.isdir(user_forecast_dir):
            # Find the newest JSON file produced by forecastModel
            json_files = glob.glob(os.path.join(user_forecast_dir, "*.json"))
            if json_files:
                latest = max(json_files, key=os.path.getmtime)
                try:
                    with open(latest, "r", encoding="utf-8") as fh:
                        payload = json.load(fh)
                        # Return cached payload immediately
                        return payload
                except Exception:
                    # If JSON is malformed, fall through and run forecast
                    pass

        # 2) No cached JSON - lazy import and run forecasting on-demand
        from importlib import import_module

        forecast_mod = import_module("forecastModel")
        forecast_for_user = getattr(forecast_mod, "forecast_for_user")

        result = forecast_for_user(user_id)
        return result  # FastAPI automatically serializes dict → JSON
    except Exception as e:
        raise HTTPException(500, detail=str(e))


@app.post("/api/evaluate")
async def api_evaluate_forecast(request: EvaluateRequest):
    """
    Evaluate an existing forecast against weekly actuals.
    
    Payload:
    {
        "user_id": "3",
        "forecast_json_path": null (optional, uses latest if not provided)
    }
    
    Returns evaluation JSON with evaluation_date and metrics per horizon.
    """
    from importlib import import_module
    
    user_id = request.user_id
    if not user_id:
        raise HTTPException(400, detail="user_id required")
    
    try:
        # Import evaluation service
        eval_svc = import_module("evaluationService")
        
        # Set up paths
        svc_dir = os.path.dirname(os.path.abspath(__file__))
        forecast_data_dir = os.path.abspath(
            os.path.join(svc_dir, "..", "backend", "files", "forecastData", f"user_{user_id}")
        )
        weekly_data_dir = os.path.abspath(
            os.path.join(svc_dir, "..", "backend", "files", "weeklyData", f"user_{user_id}")
        )
        eval_output_dir = os.path.abspath(
            os.path.join(svc_dir, "reports", "evaluation", f"user_{user_id}")
        )
        
        print(f"[Evaluate Endpoint] User: {user_id}")
        print(f"[Evaluate Endpoint] Forecast dir: {forecast_data_dir}")
        print(f"[Evaluate Endpoint] Dir exists: {os.path.isdir(forecast_data_dir)}")
        
        # Determine forecast JSON path
        forecast_json_path = request.forecast_json_path
        if not forecast_json_path:
            # Use latest forecast JSON
            if not os.path.isdir(forecast_data_dir):
                print(f"[Evaluate Endpoint] Forecast directory not found")
                raise HTTPException(404, detail=f"No forecast directory for user {user_id}")
            
            # List all JSON files in the directory
            json_files = [f for f in os.listdir(forecast_data_dir) if f.endswith('.json')]
            print(f"[Evaluate Endpoint] Found {len(json_files)} JSON files: {json_files}")
            
            if not json_files:
                print(f"[Evaluate Endpoint] No JSON files found")
                raise HTTPException(404, detail=f"No forecast JSON found for user {user_id}")
            
            # Get the latest JSON file by modification time
            json_paths = [os.path.join(forecast_data_dir, f) for f in json_files]
            forecast_json_path = max(json_paths, key=os.path.getmtime)
            print(f"[Evaluate Endpoint] Using forecast JSON: {os.path.basename(forecast_json_path)}")
        
        if not os.path.exists(forecast_json_path):
            raise HTTPException(404, detail=f"Forecast JSON not found: {forecast_json_path}")
        
        # Run evaluation on current forecast
        result = eval_svc.evaluate_forecast_json(
            user_id=user_id,
            forecast_json_path=forecast_json_path,
            weekly_data_dir=weekly_data_dir,
            output_dir=eval_output_dir
        )
        
        # Also evaluate any PREVIOUS forecasts that now have overlapping actuals
        print(f"\n[Evaluate Endpoint] Now checking for previous forecasts to evaluate...")
        previous_evals = eval_svc.evaluate_previous_forecasts_if_applicable(
            user_id=user_id,
            forecast_dir=forecast_data_dir,
            weekly_data_dir=weekly_data_dir,
            eval_output_dir=eval_output_dir
        )
        
        # Add previous evaluations to result
        result["previous_evaluations"] = previous_evals
        result["total_evaluations_performed"] = 1 + len(previous_evals)
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=f"Evaluation failed: {str(e)}")


@app.get("/health")
async def health_check():
    """Basic health endpoint to confirm the service is up without triggering
    heavy forecast work."""
    return {"status": "ok"}