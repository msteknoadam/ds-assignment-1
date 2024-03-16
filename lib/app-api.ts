import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as apig from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as node from "aws-cdk-lib/aws-lambda-nodejs";
import { generateBatch } from "../shared/util";
import { movieReviews } from "../seed/movieReviews";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as custom from "aws-cdk-lib/custom-resources";

type AppApiProps = {
	userPoolId: string;
	userPoolClientId: string;
};

export class AppApi extends Construct {
	constructor(scope: Construct, id: string, props: AppApiProps) {
		super(scope, id);

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

		const appApi = new apig.RestApi(this, "AppApi", {
			description: "DS Assignment 1 REST API",
			deployOptions: {
				stageName: "dev",
			},
			endpointTypes: [apig.EndpointType.REGIONAL],
			defaultCorsPreflightOptions: {
				allowOrigins: apig.Cors.ALL_ORIGINS,
				allowHeaders: ["Content-Type", "X-Amz-Date"],
				allowMethods: ["OPTIONS", "GET", "POST", "PUT", "PATCH", "DELETE"],
				allowCredentials: true,
			},
		});

		const appCommonFnProps = {
			architecture: lambda.Architecture.ARM_64,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			runtime: lambda.Runtime.NODEJS_16_X,
			handler: "handler",
			environment: {
				USER_POOL_ID: props.userPoolId,
				CLIENT_ID: props.userPoolClientId,
				REGION: cdk.Aws.REGION,
			},
		};

		const authorizerFn = new node.NodejsFunction(this, "AuthorizerFn", {
			...appCommonFnProps,
			entry: "./lambdas/auth/authorizer.ts",
		});

		const requestAuthorizer = new apig.RequestAuthorizer(this, "RequestAuthorizer", {
			identitySources: [apig.IdentitySource.header("cookie")],
			handler: authorizerFn,
			resultsCacheTtl: cdk.Duration.minutes(0),
		});

		const moviesEndpoint = appApi.root.addResource("movies");

		const moviesReviewsEndpoint = moviesEndpoint.addResource("reviews");
		moviesReviewsEndpoint.addMethod("POST", new apig.LambdaIntegration(newMovieReviewFn, { proxy: true }), {
			authorizer: requestAuthorizer,
			authorizationType: apig.AuthorizationType.CUSTOM,
		});

		const movieEndpoint = moviesEndpoint.addResource("{movieId}");

		const movieReviewsEndpoint = movieEndpoint.addResource("reviews");
		movieReviewsEndpoint.addMethod("GET", new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true }));

		const movieReviewsByReviewerEndpoint = movieReviewsEndpoint.addResource("{reviewerName}");
		movieReviewsByReviewerEndpoint.addMethod("GET", new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true }));
	}
}
