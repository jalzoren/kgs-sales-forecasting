# ml-service/main_app.py
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
from trainModel import SalesForecasterPipeline
import pandas as pd

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

@app.get("/api/forecast/{user_id}")
async def get_user_forecast(user_id: str):
    """
    Returns the latest forecast Excel as JSON for a specific user.
    Reads from backend/files/forecastData/user_{user_id}/
    """
    # Use user_{user_id} format to match the folder structure
    folder_path = os.path.join("backend", "files", "forecastData", f"user_{user_id}")
    
    # Get absolute path
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    absolute_folder_path = os.path.join(base_dir, folder_path)

    if not os.path.exists(absolute_folder_path):
        return {"error": f"No forecast folder found for user {user_id} at {absolute_folder_path}"}

    # List all Excel files in the user's folder (exclude temp files)
    all_files = [f for f in os.listdir(absolute_folder_path) 
                  if f.endswith((".xlsx", ".xls")) and not f.startswith("~$")]

    if not all_files:
        return {"error": f"No forecast files found for user {user_id}"}

    # Get the latest file by modification time
    latest_file = max(all_files, key=lambda f: os.path.getmtime(os.path.join(absolute_folder_path, f)))
    file_path = os.path.join(absolute_folder_path, latest_file)

    # Read Excel file - try to read forecast sheets (90d, 30d, 7d)
    try:
        # Read all sheets first
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names
        
        # Prioritize 90d > 30d > 7d forecast sheets
        target_sheet = None
        for sheet in sheet_names:
            if "90d" in sheet.lower() or "90d_forecast" in sheet.lower():
                target_sheet = sheet
                break
        if not target_sheet:
            for sheet in sheet_names:
                if "30d" in sheet.lower() or "30d_forecast" in sheet.lower():
                    target_sheet = sheet
                    break
        if not target_sheet:
            for sheet in sheet_names:
                if "7d" in sheet.lower() or "7d_forecast" in sheet.lower():
                    target_sheet = sheet
                    break
        if not target_sheet:
            # Fallback to first sheet
            target_sheet = sheet_names[0] if sheet_names else None
        
        if not target_sheet:
            return {"error": "No sheets found in Excel file"}
        
        # Read the target sheet
        df = pd.read_excel(file_path, sheet_name=target_sheet)
        
        # Ensure date column is properly formatted
        if "Date" in df.columns:
            df["Date"] = pd.to_datetime(df["Date"]).dt.strftime("%Y-%m-%d")
        
        return df.to_dict(orient="records")
    except Exception as e:
        return {"error": f"Failed to read Excel file: {str(e)}"}

