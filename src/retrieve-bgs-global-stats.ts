import { BgsGlobalHeroStat } from './bgs-global-hero-stat';
import { BgsGlobalStats } from './bgs-global-stats';
import { getConnection } from './db/rds';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	try {
		const mysql = await getConnection();
		const query = `
			SELECT * FROM bgs_hero_stats 
			WHERE date is NULL
			ORDER BY heroCardId ASC
		`;
		console.log('prepared query', query);
		const dbResults: readonly any[] = await mysql.query(query);
		console.log('executed query', dbResults && dbResults.length, dbResults && dbResults.length > 0 && dbResults[0]);

		const result = {
			heroStats: dbResults.map(
				result =>
					({
						id: result.heroCardId,
						averagePosition: result.averagePosition,
						popularity: result.popularity,
					} as BgsGlobalHeroStat),
			),
		} as BgsGlobalStats;

		const response = {
			statusCode: 200,
			isBase64Encoded: false,
			body: JSON.stringify({ result }),
		};
		console.log('sending back success reponse');
		return response;
	} catch (e) {
		console.error('issue retrieving stats', e);
		const response = {
			statusCode: 500,
			isBase64Encoded: false,
			body: JSON.stringify({ message: 'not ok', exception: e }),
		};
		console.log('sending back error reponse', response);
		return response;
	}
};
