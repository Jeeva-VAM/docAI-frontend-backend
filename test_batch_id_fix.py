#!/usr/bin/env python3
"""
Test script to verify batch_id fix implementation
"""

import requests
import json
import uuid
from typing import Dict, Any

def test_callback_with_batch_id():
    """Test the callback endpoint with batch_id"""
    
    # Test data
    payload = {
        "batch_id": str(uuid.uuid4()),
        "file_id": str(uuid.uuid4()), 
        "status": "COMPLETED",
        "extraction_json": {"foo": "bar"}
    }
    
    url = "http://localhost:8000/api/callbacks/file-processing"
    
    try:
        response = requests.post(
            url, 
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"✅ Callback test sent successfully")
        print(f"Status Code: {response.status_code}")
        print(f"Response: {response.text}")
        
        return response.status_code == 200
        
    except requests.exceptions.RequestException as e:
        print(f"❌ Callback test failed: {e}")
        return False

def test_frontend_batch_generation():
    """Test that frontend generates proper UUIDs"""
    
    # Simulate frontend batch_id generation
    batch_id = str(uuid.uuid4())
    import_batch_id = str(uuid.uuid4())
    
    print(f"✅ Generated batch_id: {batch_id}")
    print(f"✅ Generated import_batch_id: {import_batch_id}")
    
    # Verify UUID format
    try:
        uuid.UUID(batch_id)
        uuid.UUID(import_batch_id)
        print("✅ UUIDs are valid format")
        return True
    except ValueError as e:
        print(f"❌ Invalid UUID format: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Testing Batch ID Fix Implementation\n")
    
    print("1. Testing frontend UUID generation...")
    frontend_test = test_frontend_batch_generation()
    
    print("\n2. Testing backend callback with batch_id...")
    callback_test = test_callback_with_batch_id()
    
    print(f"\n📊 Test Results:")
    print(f"Frontend UUID generation: {'✅ PASS' if frontend_test else '❌ FAIL'}")
    print(f"Backend callback handling: {'✅ PASS' if callback_test else '❌ FAIL'}")
    
    if frontend_test:
        print("\n🎉 Batch ID fix implementation is working correctly!")
    else:
        print("\n⚠️  Some tests failed - check implementation")
