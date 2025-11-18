#!/bin/bash
# Get Cosmos DB keys using Azure CLI and Azure identity
# This allows you to use your local Azure credentials without manually copying keys

set -e

echo "🔑 Retrieving Cosmos DB keys using Azure CLI..."
echo ""

# Check if Azure CLI is installed and logged in
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI not found. Please install it first:"
    echo "   brew install azure-cli"
    exit 1
fi

# Check if logged in
if ! az account show &> /dev/null; then
    echo "❌ Not logged in to Azure. Running 'az login'..."
    az login
fi

# Get subscription
SUBSCRIPTION=$(az account show --query id -o tsv)
echo "✅ Using subscription: $SUBSCRIPTION"
echo ""

# Parse resource group and account names from endpoint URLs in local.settings.cosmos.json
GREMLIN_ACCOUNT=$(grep COSMOS_GREMLIN_ENDPOINT local.settings.cosmos.json | sed 's/.*https:\/\/\(.*\)\.documents.*/\1/')
SQL_ACCOUNT=$(grep COSMOS_SQL_ENDPOINT local.settings.cosmos.json | sed 's/.*https:\/\/\(.*\)\.documents.*/\1/')

echo "📍 Detected accounts from local.settings.cosmos.json:"
echo "   Gremlin: $GREMLIN_ACCOUNT"
echo "   SQL API: $SQL_ACCOUNT"
echo ""

# Try to find resource group (assumes accounts are in same resource group)
echo "🔍 Finding resource group..."
RG=$(az cosmosdb list --query "[?name=='$GREMLIN_ACCOUNT'].resourceGroup" -o tsv)

if [ -z "$RG" ]; then
    echo "❌ Could not find resource group for account: $GREMLIN_ACCOUNT"
    echo "Please specify manually:"
    read -p "Resource Group: " RG
fi

echo "✅ Using resource group: $RG"
echo ""

# Get Gremlin key
echo "🔑 Retrieving Gremlin (Graph) account key..."
GREMLIN_KEY=$(az cosmosdb keys list \
    --name "$GREMLIN_ACCOUNT" \
    --resource-group "$RG" \
    --type keys \
    --query primaryMasterKey -o tsv)

if [ -z "$GREMLIN_KEY" ]; then
    echo "❌ Failed to retrieve Gremlin key"
    exit 1
fi
echo "✅ Retrieved Gremlin key"

# Get SQL API key  
echo "🔑 Retrieving SQL API account key..."
SQL_KEY=$(az cosmosdb keys list \
    --name "$SQL_ACCOUNT" \
    --resource-group "$RG" \
    --type keys \
    --query primaryMasterKey -o tsv)

if [ -z "$SQL_KEY" ]; then
    echo "❌ Failed to retrieve SQL API key"
    exit 1
fi
echo "✅ Retrieved SQL API key"
echo ""

# Export environment variables
echo "📤 Exporting environment variables..."
export COSMOS_GREMLIN_KEY="$GREMLIN_KEY"
export COSMOS_SQL_KEY="$SQL_KEY"

echo ""
echo "✅ Keys retrieved successfully!"
echo ""
echo "Run these commands to set the keys in your current shell:"
echo ""
echo "export COSMOS_GREMLIN_KEY=\"$GREMLIN_KEY\""
echo "export COSMOS_SQL_KEY=\"$SQL_KEY\""
echo ""
echo "Or source this script:"
echo "  source scripts/get-cosmos-keys.sh"
echo ""
