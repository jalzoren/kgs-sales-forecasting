# test_vscode.py
import sys
print(f"Python executable: {sys.executable}")
print(f"Python path: {sys.path}")

try:
    import tensorflow as tf
    print(f"✅ TensorFlow {tf.__version__}")
    
    from tensorflow.keras.models import Sequential
    print("✅ Keras imports work")
    
    import xgboost as xgb
    print(f"✅ XGBoost {xgb.__version__}")
    
    print("🎉 All imports successful in VSCode!")
except ImportError as e:
    print(f"❌ Import error: {e}")