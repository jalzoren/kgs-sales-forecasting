# simple_app.py
from fastapi import FastAPI # pyright: ignore[reportMissingImports]

app = FastAPI()

@app.get("/")
def read_root():
    return ("Hello, this is your FastAPI output!")

if __name__ == "__main__":
    import uvicorn # pyright: ignore[reportMissingImports]
    uvicorn.run("main_app:app", host="127.0.0.1", port=8000, reload=True)
