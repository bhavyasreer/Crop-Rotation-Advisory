import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout
import pickle
import os

# Create models directory
os.makedirs('models', exist_ok=True)

# Load dataset with debug information
print("Current working directory:", os.getcwd())
print("Attempting to load dataset:", "cropdata.csv")
try:
    df = pd.read_csv("cropdata.csv")
    print("Dataset loaded successfully!")
    print("Number of rows:", len(df))
    print("Columns:", df.columns.tolist())
    print("First few rows:")
    print(df.head())
except Exception as e:
    print("Error loading dataset:", str(e))
    raise

# Separate features and target
X = df[['N', 'P', 'K', 'temperature', 'humidity', 'ph', 'rainfall']]
y = df['label']

# Encode target (crop labels)
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y)

# Save label encoder
with open('models/label_encoder.pkl', 'wb') as f:
    pickle.dump(label_encoder, f)

# Save feature columns
with open('models/feature_columns.pkl', 'wb') as f:
    pickle.dump(list(X.columns), f)

# Train-Test Split
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Model Building
model = Sequential([
    Dense(64, activation='relu', input_shape=(7,)),  # 7 input features
    Dense(128, activation='relu'),
    Dropout(0.3),
    Dense(64, activation='relu'),
    
    Dense(len(set(y)), activation='softmax')  # Output layer for crop classification
])

model.compile(optimizer='adam',
             loss='sparse_categorical_crossentropy',
             metrics=['accuracy'])

print("Training model...")
# Train model
history = model.fit(X_train, y_train,
                   validation_data=(X_test, y_test),
                   epochs=10,
                   batch_size=32)

# Save the model
model.save('models/crop_model.h5')
print("Model trained and saved successfully!") 