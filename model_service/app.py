from flask import Flask, request, jsonify, render_template
import numpy as np
import tensorflow as tf
import joblib
import os

app = Flask(__name__, template_folder="views")

# Load the trained ANN model and preprocessors
model = tf.keras.models.load_model("/Users/bhavyasree/Desktop/croprotation/model_service/models/crop_model.h5")
scaler = joblib.load("models/scaler.pkl")
encoder = joblib.load("models/encoder.pkl")

@app.route('/')
def home():
    return render_template('inputs1.html')  # Serve the input page

@app.route('/predict', methods=['POST'])
def predict():
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Extract input values in correct order
        features = np.array([
            data['N'], data['P'], data['K'], 
            data['temperature'], data['humidity'], 
            data['ph'], data['rainfall']
        ]).reshape(1, -1)
        
        # Normalize input features
        features_scaled = scaler.transform(features)
        
        # Predict crop probabilities
        predictions = model.predict(features_scaled)[0]  # Get probabilities
        
        # Get indices of top 5 crops
        top_indices = np.argsort(predictions)[-5:][::-1]  # Sort and get top 5
        
        # Decode labels back to crop names
        top_crops = encoder.categories_[0][top_indices]
        top_probabilities = predictions[top_indices]

        # Prepare response
        results = [
            {
                "crop": str(crop),
                "probability": float(prob),
                "confidence": float(prob * 100)  # Convert to percentage
            }
            for crop, prob in zip(top_crops, top_probabilities)
        ]

        return jsonify({'top_5_predictions': results})

    except Exception as e:
        return jsonify({'error': str(e)})

# Run Flask App
if __name__ == '__main__':
    app.run(debug=True)
