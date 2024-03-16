import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
	try {
		// Print Event
		console.log("Event: ", event);
		const pathParameters = event?.pathParameters;

		const reviewerName = pathParameters?.reviewerName;

		if (!reviewerName) {
			return {
				statusCode: 400,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Missing reviewerName parameter" }),
			};
		}

		const commandOutput = await ddbDocClient.send(
			new ScanCommand({
				TableName: process.env.TABLE_NAME,
				FilterExpression: "reviewerName = :reviewerName",
				ExpressionAttributeValues: {
					":reviewerName": reviewerName,
				},
			})
		);
		if (!commandOutput.Items || commandOutput.Items.length === 0) {
			return {
				statusCode: 404,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Movie reviews not found from the given reviewer name" }),
			};
		}
		const body = {
			data: commandOutput.Items,
		};

		// Return Response
		return {
			statusCode: 200,
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify(body),
		};
	} catch (error: any) {
		console.log(JSON.stringify(error));
		return {
			statusCode: 500,
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ error }),
		};
	}
};

function createDDbDocClient() {
	const ddbClient = new DynamoDBClient({ region: process.env.REGION });
	const marshallOptions = {
		convertEmptyValues: true,
		removeUndefinedValues: true,
		convertClassInstanceToMap: true,
	};
	const unmarshallOptions = {
		wrapNumbers: false,
	};
	const translateConfig = { marshallOptions, unmarshallOptions };
	return DynamoDBDocumentClient.from(ddbClient, translateConfig);
}
