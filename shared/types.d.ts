export type MovieReview = {
	movieId: number;
	reviewerName: string;
	/** Date in format of "2023-10-20" */
	reviewDate: string;
	content: string;
	rating: 1 | 2 | 3 | 4 | 5;
};
