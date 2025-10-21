import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error
import joblib

import os
DATA_PATH = os.getenv('DATA_PATH', 'data/sales_data.csv')
MODEL_PATH = os.getenv('MODEL_PATH', 'models/sales_forecast_model.pkl')
def load_data(path):
    data = pd.read_csv(path)
    return data
def preprocess_data(data):
    data = data.dropna()
    X = data.drop('sales', axis=1)
    y = data['sales']
    return X, y
def train_model(X, y):
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)
    mse = mean_squared_error(y_test, y_pred)
    print(f'Model Mean Squared Error: {mse}')
    return model
def save_model(model, path):
    joblib.dump(model, path)
def main():
    data = load_data(DATA_PATH)
    X, y = preprocess_data(data)
    model = train_model(X, y)
    save_model(model, MODEL_PATH)
if __name__ == '__main__':
    main()
    