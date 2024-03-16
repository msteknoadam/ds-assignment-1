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
import * as iam from "aws-cdk-lib/aws-iam";

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

		// Roles
		const translateRole = new iam.Role(this, "LambdaTranslateExecutionRole", {
			assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
			managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
		});
		translateRole.addToPolicy(
			new iam.PolicyStatement({
				actions: ["translate:TranslateText"],
				resources: ["*"],
			})
		);

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

		const getReviewerReviewsFn = new lambdanode.NodejsFunction(this, "GetReviewerReviewsFn", {
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.NODEJS_18_X,
			entry: `${__dirname}/../lambdas/getReviewerReviews.ts`,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			environment: {
				TABLE_NAME: movieReviewsTable.tableName,
				REGION: "eu-west-1",
			},
		});

		const updateMovieReviewFn = new lambdanode.NodejsFunction(this, "UpdateMovieReviewFn", {
			architecture: lambda.Architecture.ARM_64,
			runtime: lambda.Runtime.NODEJS_16_X,
			entry: `${__dirname}/../lambdas/updateMovieReview.ts`,
			timeout: cdk.Duration.seconds(10),
			memorySize: 128,
			environment: {
				TABLE_NAME: movieReviewsTable.tableName,
				REGION: "eu-west-1",
			},
		});

		const getTranslatedReviewerReviewOfMovieFn = new lambdanode.NodejsFunction(
			this,
			"GetTranslatedReviewerReviewOfMovieFn",
			{
				architecture: lambda.Architecture.ARM_64,
				runtime: lambda.Runtime.NODEJS_16_X,
				entry: `${__dirname}/../lambdas/getTranslatedReviewerReviewOfMovieFn.ts`,
				timeout: cdk.Duration.seconds(10),
				memorySize: 128,
				environment: {
					TABLE_NAME: movieReviewsTable.tableName,
					REGION: "eu-west-1",
				},
				role: translateRole,
			}
		);

		// Permissions
		movieReviewsTable.grantReadData(getMovieReviewsFn);
		movieReviewsTable.grantReadWriteData(newMovieReviewFn);
		movieReviewsTable.grantReadData(getReviewerReviewsFn);
		movieReviewsTable.grantReadWriteData(updateMovieReviewFn);
		movieReviewsTable.grantReadData(getTranslatedReviewerReviewOfMovieFn);

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

		// Endpoints
		const moviesEndpoint = appApi.root.addResource("movies");
		const moviesReviewsEndpoint = moviesEndpoint.addResource("reviews");
		const movieEndpoint = moviesEndpoint.addResource("{movieId}");
		const movieReviewsEndpoint = movieEndpoint.addResource("reviews");
		const movieReviewsByReviewerOrYearEndpoint = movieReviewsEndpoint.addResource("{reviewerNameOrYear}");
		const reviewsEndpoint = appApi.root.addResource("reviews");
		const reviewerReviewsEndpoint = reviewsEndpoint.addResource("{reviewerName}");
		const reviewerReviewOfMovieEndpoint = reviewerReviewsEndpoint.addResource("{movieId}");
		const reviewerReviewOfMovieTranslationEndpoint = reviewerReviewOfMovieEndpoint.addResource("translation");

		// Methods
		moviesReviewsEndpoint.addMethod("POST", new apig.LambdaIntegration(newMovieReviewFn, { proxy: true }), {
			authorizer: requestAuthorizer,
			authorizationType: apig.AuthorizationType.CUSTOM,
		});
		movieReviewsEndpoint.addMethod("GET", new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true }));
		movieReviewsByReviewerOrYearEndpoint.addMethod(
			"GET",
			new apig.LambdaIntegration(getMovieReviewsFn, { proxy: true })
		);
		movieReviewsByReviewerOrYearEndpoint.addMethod(
			"PUT",
			new apig.LambdaIntegration(updateMovieReviewFn, { proxy: true }),
			{
				authorizer: requestAuthorizer,
				authorizationType: apig.AuthorizationType.CUSTOM,
			}
		);
		reviewerReviewsEndpoint.addMethod("GET", new apig.LambdaIntegration(getReviewerReviewsFn, { proxy: true }));
		reviewerReviewOfMovieTranslationEndpoint.addMethod(
			"GET",
			new apig.LambdaIntegration(getTranslatedReviewerReviewOfMovieFn, { proxy: true })
		);
	}
}
