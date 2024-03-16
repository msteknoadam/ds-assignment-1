import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import { UserPool } from "aws-cdk-lib/aws-cognito";
import { AuthApi } from "./auth-api";
import { AppApi } from "./app-api";

export class DsAssignment1Stack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		// User Pool and Client
		const userPool = new UserPool(this, "UserPool", {
			signInAliases: { username: true, email: true },
			selfSignUpEnabled: true,
			removalPolicy: cdk.RemovalPolicy.DESTROY,
		});

		const userPoolId = userPool.userPoolId;

		const appClient = userPool.addClient("AppClient", {
			authFlows: { userPassword: true },
		});

		const userPoolClientId = appClient.userPoolClientId;

		// Auth
		new AuthApi(this, "AuthServiceApi", {
			userPoolId: userPoolId,
			userPoolClientId: userPoolClientId,
		});

		// App API with Authorizer
		new AppApi(this, "AppApi", {
			userPoolId: userPoolId,
			userPoolClientId: userPoolClientId,
		});
	}
}
