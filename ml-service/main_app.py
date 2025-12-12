# ml-service/main_app.py
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from forecastModel import forecast_for_user
import os
from trainModel import SalesForecasterPipeline

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
allow_origins=[
    "https://kgs-sales-forecasting-frontend.onrender.com", #frontend
    "https://kgs-sales-forecasting.onrender.com", #backend
    "http://localhost:3000",
    "http://localhost:5173"
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class TrainRequest(BaseModel):
    user_id: str

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
            pipeline = SalesForecasterPipeline(user_id)
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
    try:
        result = forecast_for_user(user_id)
        return result  # FastAPI automatically serializes dict → JSON
    except Exception as e:
        raise HTTPException(500, detail=str(e))