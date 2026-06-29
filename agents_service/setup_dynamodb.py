"""
Setup script to create the DynamoDB table for Fablecraft.
Run this once to provision the table in your AWS account.

Usage:
    python setup_dynamodb.py
"""

import os
import sys
import boto3
from botocore.exceptions import ClientError

TABLE_NAME = os.getenv("DYNAMODB_TABLE_NAME", "fablecraft-data")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")


def create_fablecraft_table():
    """Create the DynamoDB table with PAY_PER_REQUEST billing."""
    client = boto3.client("dynamodb", region_name=AWS_REGION)

    try:
        # Check if table exists
        response = client.describe_table(TableName=TABLE_NAME)
        status = response["Table"]["TableStatus"]
        print(f"✓ Table '{TABLE_NAME}' already exists (status: {status})")
        print(f"  ARN: {response['Table']['TableArn']}")
        return True
    except client.exceptions.ResourceNotFoundException:
        pass

    print(f"Creating DynamoDB table '{TABLE_NAME}' in {AWS_REGION}...")

    try:
        client.create_table(
            TableName=TABLE_NAME,
            KeySchema=[
                {"AttributeName": "PK", "KeyType": "HASH"},
                {"AttributeName": "SK", "KeyType": "RANGE"},
            ],
            AttributeDefinitions=[
                {"AttributeName": "PK", "AttributeType": "S"},
                {"AttributeName": "SK", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
            Tags=[
                {"Key": "Project", "Value": "Fablecraft"},
                {"Key": "Hackathon", "Value": "H0-Vercel-AWS"},
                {"Key": "Environment", "Value": "production"},
            ],
        )

        # Wait for table to become active
        print("  Waiting for table to become ACTIVE...")
        waiter = client.get_waiter("table_exists")
        waiter.wait(TableName=TABLE_NAME)

        # Get table info
        response = client.describe_table(TableName=TABLE_NAME)
        print(f"✓ Table '{TABLE_NAME}' created successfully!")
        print(f"  ARN: {response['Table']['TableArn']}")
        print(f"  Status: {response['Table']['TableStatus']}")
        print(f"  Billing: PAY_PER_REQUEST (serverless, scales to millions)")
        return True

    except ClientError as e:
        print(f"✗ Error creating table: {e}")
        return False


def seed_sample_data():
    """Optionally seed some sample data for testing."""
    from database import create_user, get_or_create_progress

    print("\nSeeding sample data...")
    user = create_user(display_name="Demo Explorer")
    progress = get_or_create_progress(user["user_id"])
    print(f"  Created demo user: {user['user_id']}")
    print(f"  Progress initialized: Level {progress.get('level', 1)}")


if __name__ == "__main__":
    print("=" * 60)
    print("  Fablecraft DynamoDB Setup")
    print("=" * 60)
    print(f"  Region: {AWS_REGION}")
    print(f"  Table:  {TABLE_NAME}")
    print("=" * 60)
    print()

    success = create_fablecraft_table()

    if success and "--seed" in sys.argv:
        seed_sample_data()

    print("\n✓ Setup complete!")
    print(f"\nTo verify in AWS Console:")
    print(f"  https://{AWS_REGION}.console.aws.amazon.com/dynamodbv2/home?region={AWS_REGION}#table?name={TABLE_NAME}")
