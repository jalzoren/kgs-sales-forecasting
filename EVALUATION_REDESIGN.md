# Evaluation Architecture Redesign - Implementation Summary

## Overview
Implemented a complete architectural redesign of the evaluation system to separate evaluation from forecast generation, enabling evaluation-on-upload and proper metric attribution with evaluation dates.

## Key Changes

### 1. Created Separate Evaluation Service
**File**: `ml-service/evaluationService.py`
- Standalone evaluation service decoupled from forecast generation
- `evaluate_forecast_json()` function evaluates existing forecasts against weekly actuals
- Saves results as separate JSON files with `evaluation_date` timestamp
- Returns structured evaluation data with per-horizon metrics (RMSE, MAE, MAPE)
- Includes `WeeklyFileFinder` class for locating weekly data files by date range

**Key Features**:
- Reads forecast JSON and weekly Excel files
- Computes overlap between forecast period and available actuals
- Generates per-horizon evaluation results
- Saves evaluation JSON to `ml-service/reports/evaluation/user_X/evaluation_*.json`

### 2. Added FastAPI Evaluation Endpoint
**File**: `ml-service/main_app.py`
- New `/api/evaluate` POST endpoint
- Accepts `user_id` and optional `forecast_json_path`
- Uses latest forecast JSON if path not specified
- Delegates to `evaluationService.evaluate_forecast_json()`
- Returns evaluation result with `evaluation_date`

**Endpoint Details**:
```python
POST /api/evaluate
{
  "user_id": "3",
  "forecast_json_path": null  # Optional
}
```

### 3. Integrated Evaluation into Upload Flow
**File**: `backend/controllers/dataController.js`
- After forecast generation completes, automatically triggers evaluation
- Calls ML service `/api/evaluate` endpoint via `PythonService.evaluateForecast()`
- Non-critical: evaluation failure doesn't fail the upload

**Flow**:
1. Weekly file uploaded
2. Preprocessing runs
3. Forecast generated
4. **NEW**: Evaluation triggered immediately after forecast
5. Evaluation JSON created with evaluation_date

### 4. Updated Python Integration
**File**: `backend/services/pythonService.js`
- New `evaluateForecast()` method
- Makes axios POST request to ML service `/api/evaluate`
- 60-second timeout for evaluation computation
- Error handling with descriptive messages

### 5. Updated Backend Dashboard API
**File**: `backend/controllers/homeController.js`
- New `getLatestEvaluation()` helper method
- Searches for latest evaluation JSON in `ml-service/reports/evaluation/user_X/`
- Extracts metrics with `evaluation_date` from separate JSON
- Builds evaluation summary with date attribution

**Changes**:
- Dashboard now reads from **separate evaluation JSON** (not forecast JSON)
- Forecast Accuracy calculated from `evaluation_data.horizons["7"].metrics.MAPE`
- Includes `evaluation_date` in response statistics
- Gracefully handles missing evaluations

### 6. Updated Frontend Dashboard Display
**File**: `frontend/src/components/Navbar.jsx`
- Shows "Forecast Accuracy: X%" with evaluation date
- Displays format: "evaluated YYYY-MM-DD"
- Falls back to variance display if no evaluation available
- Properly formats accuracy: `100 - MAPE`

**Display Logic**:
```jsx
// Before: "MAPE (7-day) | variance: +5%"
// After: "evaluated 2025-12-13"
```

## Architecture Benefits

### 1. Separation of Concerns
- **Forecast generation**: Produces future predictions
- **Evaluation**: Compares past forecasts with actuals (triggered on data upload)
- Two independent processes with clear responsibility boundaries

### 2. Proper Evaluation Timing
- Evaluation happens **when actuals are available** (weekly upload)
- Not dependent on forecast generation timing
- Can re-evaluate forecasts with new actuals without re-generating forecasts

### 3. Better Date Attribution
- `forecast_date`: When the forecast was generated (in forecast JSON)
- `evaluation_date`: When the forecast was evaluated (in evaluation JSON)
- Frontend shows evaluation date to users for transparency

### 4. Scalability
- Evaluation is decoupled and can be run independently
- No longer embedded in large forecast Excel files
- Separate JSON files for each evaluation enable better history tracking

## Data Flow

```
Weekly Upload
    ↓
Preprocessing
    ↓
Forecast Generation (generates forecast JSON)
    ↓
[NEW] Evaluation Trigger → ML Service /api/evaluate
    ↓
evaluationService.py evaluates forecast vs weekly actuals
    ↓
Evaluation JSON saved: evaluation_forecast_20251110_*_20251213_003410.json
    ↓
Dashboard fetches latest evaluation JSON
    ↓
Navbar displays: "Forecast Accuracy: 85% (evaluated 2025-12-13)"
```

## File Changes Summary

| File | Change Type | Impact |
|------|------------|--------|
| `ml-service/evaluationService.py` | Created | New evaluation service |
| `ml-service/main_app.py` | Modified | Added /api/evaluate endpoint |
| `backend/controllers/dataController.js` | Modified | Triggers evaluation after forecast |
| `backend/services/pythonService.js` | Modified | New evaluateForecast() method |
| `backend/controllers/homeController.js` | Modified | Reads evaluation from separate JSON |
| `frontend/src/components/Navbar.jsx` | Modified | Shows evaluation_date |

## Testing

**Evaluation Service Direct Test**:
```bash
cd ml-service
python evaluationService.py 3
# Output: Creates evaluation_forecast_*.json with metrics and evaluation_date
```

**Evaluation JSON Structure**:
```json
{
  "user_id": "3",
  "evaluation_date": "2025-12-13T00:34:06.597485",
  "forecast_json": "forecast_20251117_to_20251123.json",
  "horizons": {
    "7": {
      "status": "evaluated",
      "records": 500,
      "metrics": {
        "RMSE": 45.23,
        "MAE": 32.15,
        "MAPE": 15.42
      }
    },
    "30": { ... },
    "90": { ... }
  }
}
```

## Future Improvements

1. **Batch Evaluation**: Re-evaluate all past forecasts when new actuals arrive
2. **Evaluation History**: Track how accuracy improves over time
3. **Alert System**: Notify users when forecast accuracy drops below threshold
4. **Per-Product Evaluation**: Store detailed per-product metrics separately
5. **Comparison Reports**: Generate forecast vs actual comparison reports

## Notes

- Evaluation directories are created automatically by evaluationService.py
- Weekly file date extraction supports both `YYYY-MM-DD` and `YYYYMMDD` formats
- Non-overlapping forecast/actual date ranges return status `"no_overlap"` (expected for future forecasts)
- Evaluation is non-blocking: upload completes successfully even if evaluation fails
- Dashboard gracefully degrades if evaluation JSON not found
