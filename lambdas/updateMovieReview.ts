import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import Ajv from "ajv";
import schema from "../shared/types.schema.json";

const ajv = new Ajv();
const isValidBodyParams = ajv.compile(schema.definitions["MovieReviewUpdateAttributes"] || {});

const ddbDocClient = createDDbDocClient();

export const handler: APIGatewayProxyHandlerV2 = async (event, context) => {
	try {
		// Print Event
		console.log("Event: ", event);

		const pathParameters = event?.pathParameters;
		const movieId = pathParameters?.movieId ? parseInt(pathParameters.movieId) : undefined;
		// path parameter name is reviewerNameOrYear since it's shared with getMovieReviews.ts which can filter by reviewerName and year
		const reviewerName = pathParameters?.reviewerNameOrYear;

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

		const foundReviews = await ddbDocClient.send(
			new QueryCommand({
				TableName: process.env.TABLE_NAME,
				KeyConditionExpression: "movieId = :movieId",
				FilterExpression: "reviewerName = :reviewerName",
				ExpressionAttributeValues: {
					":movieId": movieId,
					":reviewerName": reviewerName,
				},
			})
		);

		if (!foundReviews.Items || foundReviews.Items.length === 0) {
			return {
				statusCode: 404,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ Message: "Movie review not found" }),
			};
		}

		// Since it's assumed that there will be only one review per movieId and reviewerName, I'm taking the first item from the array
		// Also, the reason I try to get the review first is because apparently UpdateCommand doesn't work with just the partition key,
		// but rather also need the sort key, and since it's not defined exactly in the assignment requirements what assignments
		// user should pass when updating the review, I'm instead fetching the review first and then updating it instead of asking
		// that information from the user to provide a better user experience
		const { reviewDate } = foundReviews.Items[0];

		const body = event.body ? JSON.parse(event.body) : undefined;
		if (!body) {
			return {
				statusCode: 400,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({ message: "Missing request body" }),
			};
		}

		if (!isValidBodyParams(body)) {
			return {
				statusCode: 400,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify({
					message: `Incorrect type. Must match Movie Review update request attribute requirements. See schema`,
					schema: schema.definitions["MovieReviewUpdateAttributes"],
				}),
			};
		}

		const commandOutput = await ddbDocClient.send(
			new UpdateCommand({
				TableName: process.env.TABLE_NAME,
				Key: { movieId, reviewDate },
				ConditionExpression: "reviewerName = :reviewerName",
				UpdateExpression: "set content = :newContent",
				ExpressionAttributeValues: {
					":newContent": body.content,
					":reviewerName": reviewerName,
				},
			})
		);
		return {
			statusCode: 200,
			headers: {
				"content-type": "application/json",
			},
			body: JSON.stringify({ message: "Movie Review updated" }),
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
