// src/services/dynamo.service.js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

const region = process.env.AWS_REGION || "ap-southeast-2";
const TABLE = process.env.DYNAMODB_TABLE || "snapnotes-notes";

/**
 * Use the default credential chain:
 * - Explicit env vars (AWS_ACCESS_KEY_ID/SECRET/SESSION_TOKEN)
 * - Profile/SSO (AWS_PROFILE + AWS_SDK_LOAD_CONFIG=1 + mounted ~/.aws)
 * - Container/instance roles
 */
async function getDynamoDBClient() {
  const credentials = fromNodeProviderChain(); // lazy, resolves on first use
  return new DynamoDBClient({ region, credentials });
}

const client = await getDynamoDBClient();
const docClient = DynamoDBDocumentClient.from(client);

export async function createNote({ ownerId, noteId, s3Key, caption, tags }) {
  const params = {
    TableName: TABLE,
    Item: {
      "qut-username": ownerId, // partition key
      "username": noteId,      // sort key (as per your schema)
      s3Key,
      caption: caption || "",
      tags: tags || [],
      createdAt: new Date().toISOString(),
    },
  };
  try {
    console.log("DynamoDB PutItem Params:", params);
    await docClient.send(new PutCommand(params));
    return { success: true };
  } catch (error) {
    console.error("DynamoDB Error:", error);
    throw error;
  }
}

export async function listNotes({ ownerId, q = "", tag, limit = 20, cursor }) {
  const params = {
    TableName: TABLE,
    KeyConditionExpression: "#qutUsername = :qutUsername",
    ExpressionAttributeNames: {
      "#qutUsername": "qut-username",
    },
    ExpressionAttributeValues: {
      ":qutUsername": ownerId,
    },
    Limit: Number(limit),
    ExclusiveStartKey: cursor ? JSON.parse(cursor) : undefined,
  };

  // Optional filtering by caption (q) or tag
  if (q) {
    params.FilterExpression = "contains(#caption, :searchTerm)";
    params.ExpressionAttributeNames["#caption"] = "caption";
    params.ExpressionAttributeValues[":searchTerm"] = q;
  } else if (tag) {
    params.FilterExpression = "contains(#tags, :searchTag)";
    params.ExpressionAttributeNames["#tags"] = "tags";
    params.ExpressionAttributeValues[":searchTag"] = tag;
  }

  try {
    console.log("DynamoDB Query Params:", params);
    const { Items, LastEvaluatedKey } = await docClient.send(new QueryCommand(params));
    return {
      items: Items,
      cursor: LastEvaluatedKey ? JSON.stringify(LastEvaluatedKey) : undefined,
    };
  } catch (error) {
    console.error("DynamoDB Query Error:", error);
    throw error;
  }
}
