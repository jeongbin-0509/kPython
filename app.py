from flask import Flask, render_template, send_file
import os

app = Flask(__name__)

@app.get("/")
def home():
    return render_template("index.html")

@app.get("/hangle.py")
def hangle_file():
    return send_file(os.path.join(os.path.dirname(__file__), "hangle.py"))

if __name__ == "__main__":
    app.run(debug=True)
