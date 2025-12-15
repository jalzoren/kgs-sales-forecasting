# ml-service/main_app.py
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import pandas as pd
import json
import glob
import os
from datetime import datetime
from trainModel import ProductForecasterPipeline

app = FastAPI()

# =====================================================
# CORS
# =====================================================
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://kgs-sales-forecasting-frontend.onrender.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =====================================================
# BASE DIRECTORIES (RENDER SAFE)
# =====================================================
BASE_DIR = os.path.abspath(".")
DATA_DIR = os.path.join(BASE_DIR, "data")
FORECAST_DIR = os.path.join(DATA_DIR, "forecastData")
WEEKLY_DIR = os.path.join(DATA_DIR, "weeklyData")
REPORT_DIR = os.path.join(BASE_DIR, "reports")
MODEL_DIR = os.path.join(BASE_DIR, "models")

for d in [DATA_DIR, FORECAST_DIR, WEEKLY_DIR, REPORT_DIR, MODEL_DIR]:
    os.makedirs(d, exist_ok=True)

# =====================================================
# REQUEST MODELS
# =====================================================
class TrainRequest(BaseModel):
    user_id: str

class EvaluateRequest(BaseModel):
    user_id: str
    forecast_json_path: Optional[str] = None

# =====================================================
# IN-MEMORY STATUS
# =====================================================
training_status = {}

# =====================================================
# TRAIN MODEL
# =====================================================
@app.post("/api/train")
async def start_training(request: TrainRequest, background_tasks: BackgroundTasks):
    user_id = request.user_id

    if training_status.get(user_id) == "running":
        raise HTTPException(400, detail="Training already in progress")

    training_status[user_id] = "running"

    def run_training():
        try:
            pipeline = ProductForecasterPipeline(
                user_id=user_id,
                base_data_dir=DATA_DIR,
                model_dir=MODEL_DIR,
                report_dir=REPORT_DIR
            )
            pipeline.run()

            training_status[user_id] = {
                "status": "completed",
                "message": "Model training completed successfully!",
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            training_status[user_id] = {
                "status": "failed",
                "message": f"Training failed: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }

    background_tasks.add_task(run_training)
    return {"status": "started", "message": "Training started in background"}

# =====================================================
# TRAINING STATUS
# =====================================================
@app.get("/api/training-status/{user_id}")
async def get_status(user_id: str):
    return training_status.get(user_id, {"status": "none"})

# =====================================================
# METRICS
# =====================================================
@app.get("/api/metrics/{user_id}")
async def get_all_metrics(user_id: str):
    report_path = os.path.join(REPORT_DIR, f"user_{user_id}_training_report.csv")

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
    report_path = os.path.join(REPORT_DIR, f"user_{user_id}_training_report.csv")

    if not os.path.exists(report_path):
        raise HTTPException(404, detail="No evaluation report found. Train the model first.")

    df = pd.read_csv(report_path)
    df["Product_ID"] = df["Product_ID"].astype(str)
    matching = df[df["Product_ID"] == str(product_id)]

    if matching.empty:
        raise HTTPException(404, detail=f"No metrics found for Product_ID {product_id}")

    return matching.to_dict(orient="records")[0]

# =====================================================
# FORECAST (JSON CACHE + LAZY IMPORT)
# =====================================================
@app.get("/api/forecast/{user_id}")
async def api_get_forecast(user_id: str):
    try:
        user_forecast_dir = os.path.join(FORECAST_DIR, f"user_{user_id}")
        os.makedirs(user_forecast_dir, exist_ok=True)

        json_files = glob.glob(os.path.join(user_forecast_dir, "*.json"))
        if json_files:
            latest = max(json_files, key=os.path.getmtime)
            with open(latest, "r", encoding="utf-8") as fh:
                return json.load(fh)

        # Lazy import (heavy)
        from importlib import import_module
        forecast_mod = import_module("forecastModel")
        forecast_for_user = getattr(forecast_mod, "forecast_for_user")

        result = forecast_for_user(
            user_id=user_id,
            base_data_dir=DATA_DIR,
            model_dir=MODEL_DIR,
            output_dir=user_forecast_dir
        )

        return result

    except Exception as e:
        raise HTTPException(500, detail=str(e))

# =====================================================
# EVALUATE FORECAST
# =====================================================
@app.post("/api/evaluate")
async def api_evaluate_forecast(request: EvaluateRequest):
    user_id = request.user_id
    if not user_id:
        raise HTTPException(400, detail="user_id required")

    try:
        from importlib import import_module
        eval_svc = import_module("evaluationService")

        forecast_data_dir = os.path.join(FORECAST_DIR, f"user_{user_id}")
        weekly_data_dir = os.path.join(WEEKLY_DIR, f"user_{user_id}")
        eval_output_dir = os.path.join(REPORT_DIR, "evaluation", f"user_{user_id}")
        os.makedirs(eval_output_dir, exist_ok=True)

        if not os.path.isdir(forecast_data_dir):
            raise HTTPException(404, detail="No forecast directory found")

        json_files = [f for f in os.listdir(forecast_data_dir) if f.endswith(".json")]
        if not json_files:
            raise HTTPException(404, detail="No forecast JSON found")

        forecast_json_path = request.forecast_json_path
        if not forecast_json_path:
            json_paths = [os.path.join(forecast_data_dir, f) for f in json_files]
            forecast_json_path = max(json_paths, key=os.path.getmtime)

        if not os.path.exists(forecast_json_path):
            raise HTTPException(404, detail="Forecast JSON not found")

        result = eval_svc.evaluate_forecast_json(
            user_id=user_id,
            forecast_json_path=forecast_json_path,
            weekly_data_dir=weekly_data_dir,
            output_dir=eval_output_dir
        )

        previous = eval_svc.evaluate_previous_forecasts_if_applicable(
            user_id=user_id,
            forecast_dir=forecast_data_dir,
            weekly_data_dir=weekly_data_dir,
            eval_output_dir=eval_output_dir
        )

        result["previous_evaluations"] = previous
        result["total_evaluations_performed"] = 1 + len(previous)

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, detail=f"Evaluation failed: {str(e)}")

# =====================================================
# HEALTH
# =====================================================
@app.get("/health")
async def health_check():
    return {"status": "ok"}
