import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";
import { TranslateClient, TranslateTextCommand } from "@aws-sdk/client-translate";

const ajv = new Ajv();
const isValidQueryParams = ajv.compile(schema.definitions["TranslationQueryParams"] || {});

const ddbDocClient = createDDbDocClient();
const translateClient = new TranslateClient({ region: process.env.REGION });

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
	try {
		// Print Event
		console.log("Event: ", event);
		const pathParameters = event?.pathParameters;
		const queryParameters = event?.queryStringParameters;

		const movieId = pathParameters?.movieId ? parseInt(pathParameters.movieId) : undefined;
		const reviewerName = pathParameters?.reviewerName;

		if (!movieId) {
			return {
				statusCode: 400,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Missing movieId parameter" }),
			};
		}
		if (!reviewerName) {
			return {
				statusCode: 400,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Missing reviewerName parameter" }),
			};
		}
		if (!isValidQueryParams(queryParameters)) {
			return {
				statusCode: 400,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					message: `Incorrect type. Must match Query parameters schema`,
					schema: schema.definitions["TranslationQueryParams"],
				}),
			};
		}

		const { language: targetLanguageCode } = queryParameters;

		const queryParams: QueryCommandInput = {
			TableName: process.env.TABLE_NAME,
			KeyConditionExpression: "movieId = :movieId",
			FilterExpression: "reviewerName = :reviewerName",
			ExpressionAttributeValues: {
				":movieId": movieId,
				":reviewerName": reviewerName,
			},
		};

		const commandOutput = await ddbDocClient.send(new QueryCommand(queryParams));
		if (!commandOutput.Items || commandOutput.Items.length === 0) {
			return {
				statusCode: 404,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Movie review not found" }),
			};
		}

		const foundReview = commandOutput.Items[0]; // It was assumed inside the assignment definition that there's only one review per movie and reviewer

		const { TranslatedText } = await translateClient.send(
			new TranslateTextCommand({
				Text: foundReview.content,
				SourceLanguageCode: "en", // It was assumed in the assignment definition that the source language is English
				TargetLanguageCode: targetLanguageCode,
			})
		);

		const body = {
			data: {
				...foundReview,
				content: TranslatedText || foundReview.content, // in case of translation returns empty (since typing suggests that it is possible to get undefined), return the original content
			},
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
