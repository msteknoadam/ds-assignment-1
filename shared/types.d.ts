export type MovieReview = {
	movieId: number;
	reviewerName: string;
	/** Date in format of "2023-10-20" */
	reviewDate: string;
	content: string;
	rating: 1 | 2 | 3 | 4 | 5;
};

export type SignUpBody = {
	username: string;
	password: string;
	email: string;
};

export type ConfirmSignUpBody = {
	username: string;
	code: string;
};

export type SignInBody = {
	username: string;
	password: string;
};

// Used to validate the body of movie review update request
export type MovieReviewUpdateAttributes = Pick<MovieReview, "content">;

// Used to validate the query parameters of translation request
export type TranslationQueryParams = {
	language: string;
};
