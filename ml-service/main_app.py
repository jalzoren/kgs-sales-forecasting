# ml-service/main_app.py
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from trainModel import SalesForecasterPipeline

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
