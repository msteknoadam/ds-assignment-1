import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput, ScanCommand } from "@aws-sdk/lib-dynamodb";

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
	try {
		// Print Event
		console.log("Event: ", event);
		const pathParameters = event?.pathParameters;
		const queryParameters = event?.queryStringParameters;

		const movieId = pathParameters?.movieId ? parseInt(pathParameters.movieId) : undefined;
		const minRating = queryParameters?.minRating ? parseFloat(queryParameters.minRating) : undefined;

		if (!movieId) {
			return {
				statusCode: 404,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Missing movieId parameter" }),
			};
		}

		const queryParams: QueryCommandInput = {
			TableName: process.env.TABLE_NAME,
			// Assuming 'movieId' is the partition key or you are using a GSI where 'movieId' can be queried.
			KeyConditionExpression: "movieId = :movieId",
			ExpressionAttributeValues: {
				":movieId": movieId,
			},
		};

		if (minRating) {
			queryParams.FilterExpression = "rating > :minRating";
			queryParams.ExpressionAttributeValues![":minRating"] = minRating;
		}

		const commandOutput = await ddbDocClient.send(new QueryCommand(queryParams));
		if (!commandOutput.Items || commandOutput.Items.length === 0) {
			return {
				statusCode: 404,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Movie reviews not found" }),
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
