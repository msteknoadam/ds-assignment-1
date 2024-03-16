import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { generateBatch } from "../shared/util";
import { movieReviews } from "../seed/movieReviews";
import * as apig from "aws-cdk-lib/aws-apigateway";

export class DsAssignment1Stack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// Tables
		const movieReviewsTable = new dynamodb.Table(this, "MovieReviewsTable", {
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
			sortKey: { name: "reviewDate", type: dynamodb.AttributeType.STRING },
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			tableName: "MovieReviews",
		});

		// Seeders
		new custom.AwsCustomResource(this, "movieReviewsddbInitData", {
			onCreate: {
				service: "DynamoDB",
				action: "batchWriteItem",
				parameters: {
					RequestItems: {
						[movieReviewsTable.tableName]: generateBatch(movieReviews),
					},
				},
				physicalResourceId: custom.PhysicalResourceId.of("movieReviewsddbInitData"),
			},
			policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
				resources: [movieReviewsTable.tableArn],
			}),
		});

		// Functions
		const getMovieReviewsFn = new lambdanode.NodejsFunction(this, "GetMovieReviewsFn", {
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.NODEJS_18_X,
			entry: `${__dirname}/../lambdas/getMovieReviews.ts`,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			environment: {
				TABLE_NAME: movieReviewsTable.tableName,
				REGION: "eu-west-1",
			},
		});

		const newMovieReviewFn = new lambdanode.NodejsFunction(this, "AddMovieReviewFn", {
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.NODEJS_16_X,
			entry: `${__dirname}/../lambdas/addMovieReview.ts`,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			environment: {
				TABLE_NAME: movieReviewsTable.tableName,
				REGION: "eu-west-1",
			},
		});

		// Permissions
		movieReviewsTable.grantReadData(getMovieReviewsFn);
		movieReviewsTable.grantReadWriteData(newMovieReviewFn);

		const api = new apig.RestApi(this, "RestAPI", {
			description: "DS Assignment 1 API",
			deployOptions: {
				stageName: "dev",
			},
			defaultCorsPreflightOptions: {
				allowHeaders: ["Content-Type", "X-Amz-Date"],
				allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
				allowCredentials: true,
				allowOrigins: ["*"],
			},
		});

		const moviesEndpoint = api.root.addResource("movies");

		const moviesReviewsEndpoint = moviesEndpoint.addResource("reviews");
		moviesReviewsEndpoint.addMethod("POST", new apig.LambdaIntegration(newMovieReviewFn, { proxy: true }));

		const movieEndpoint = moviesEndpoint.addResource("{movieId}");

		const movieReviewsEndpoint = movieEndpoint.addResource("reviews");
		movieReviewsEndpoint.addMethod("GET", new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true }));
	}
}
