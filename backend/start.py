import uvicorn

if __name__ == "__main__":
    # 0.0.0.0 lets a physical phone on the same Wi-Fi reach the API.
    uvicorn.run("app.main:app", host="0.0.0.0", port=8080, reload=True)
