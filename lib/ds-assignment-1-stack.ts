import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { movieReviews } from "../seed/movieReviews";
import * as custom from "aws-cdk-lib/custom-resources";
import { generateBatch } from "../shared/util";

export class DsAssignment1Stack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// The code that defines your stack goes here

		// Tables
		const movieReviewsTable = new dynamodb.Table(this, "MovieReviewsTable", {
			billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
			partitionKey: { name: "movieId", type: dynamodb.AttributeType.NUMBER },
			removalPolicy: cdk.RemovalPolicy.DESTROY,
			tableName: "MovieReviews",
		});

		// Seeders
		new custom.AwsCustomResource(this, "movieReviewsdbInitData", {
			onCreate: {
				service: "DynamoDB",
				action: "batchWriteItem",
				parameters: {
					RequestItems: {
						[movieReviewsTable.tableName]: generateBatch(movieReviews),
					},
				},
				physicalResourceId: custom.PhysicalResourceId.of("movieReviewsdbInitData"),
			},
			policy: custom.AwsCustomResourcePolicy.fromSdkCalls({
				resources: [movieReviewsTable.tableArn],
			}),
		});
	}
}
