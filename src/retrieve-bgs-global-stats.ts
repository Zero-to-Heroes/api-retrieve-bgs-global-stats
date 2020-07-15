import { BgsGlobalHeroStat } from './bgs-global-hero-stat';
import { BgsGlobalStats } from './bgs-global-stats';
import { getConnection } from './db/rds';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	try {
		const mysql = await getConnection();

		// First get the list of active heroes
		const heroesDateQuery = `
			SELECT date FROM bgs_hero_stats WHERE date IS NOT NULL ORDER BY id desc limit 1 
		`;
		console.log('heroesDateQuery', heroesDateQuery, await mysql.query(heroesDateQuery));
		const heroesLastDate: Date = (await mysql.query(heroesDateQuery))[0].date;
		console.log('heroesLastDate', heroesLastDate);
		const allHeroesQuery = `
			SELECT heroCardId FROM bgs_hero_stats 
			WHERE date = '${heroesLastDate.toISOString()}'
			ORDER BY heroCardId ASC
		`;
		const allHeroesDbResult: readonly any[] = await mysql.query(allHeroesQuery);
		console.log('allHeroesDbResult', allHeroesDbResult);
		const allHeroes: string = allHeroesDbResult.map(result => `'${result.heroCardId}'`).join(',');
		console.log('allHeroes', allHeroes);

		// Global stats, like popularity, etc.
		const heroStatsQuery = `
			SELECT * FROM bgs_hero_stats 
			WHERE date is NULL
			AND heroCardId in (${allHeroes})
			ORDER BY heroCardId ASC
		`;
		// console.log('prepared query', heroStatsQuery);
		const heroStatsDbResults: readonly any[] = await mysql.query(heroStatsQuery);
		// console.log(
		// 	'executed query',
		// 	heroStatsDbResults && heroStatsDbResults.length,
		// 	heroStatsDbResults && heroStatsDbResults.length > 0 && heroStatsDbResults[0],
		// );
		const heroStats = [
			...heroStatsDbResults.map(
				result =>
					({
						id: result.heroCardId,
						averagePosition: result.averagePosition,
						popularity: result.popularity,
						top4: result.top4,
						top1: result.top1,
						tier: result.tier,
					} as BgsGlobalHeroStat),
			),
			{
				id: 'average',
			},
		];

		// Tribes stats
		const tribeDateQuery = `
			SELECT creationDate FROM bgs_hero_tribes_at_end ORDER BY id desc limit 1
		`;
		// console.log('trbe date', await mysql.query(tribeDateQuery));
		const tribeLastDate: Date = (await mysql.query(tribeDateQuery))[0].creationDate;
		const tribesAtEndStatsQuery = `
			SELECT * FROM bgs_hero_tribes_at_end 
			WHERE creationDate = '${tribeLastDate.toISOString()}'
			ORDER BY heroCardId ASC
		`;
		// console.log('prepared query', tribesAtEndStatsQuery);
		const tribesDbResults: readonly any[] = await mysql.query(tribesAtEndStatsQuery);
		// console.log(
		// 	'executed query',
		// 	tribesDbResults && tribesDbResults.length,
		// 	tribesDbResults && tribesDbResults.length > 0 && tribesDbResults[0],
		// );
		const heroStatsWithTribes = heroStats.map(stat => {
			const relevantTribes = tribesDbResults.filter(tribeStat => tribeStat.heroCardId === stat.id);
			return {
				...stat,
				tribesStat: relevantTribes.map(tribe => ({
					tribe: tribe.tribe.toLowerCase(),
					percent: tribe.percent,
				})),
			} as BgsGlobalHeroStat;
		});
		// console.log('hero stats with tribes', heroStatsWithTribes);

		// Warband stats stats
		const warbandDateQuery = `
			SELECT creationDate FROM bgs_hero_warband_stats ORDER BY id desc limit 1
		`;
		// console.log('warband date', (await mysql.query(warbandDateQuery))[0].creationDate);
		const warbandLastDate: Date = (await mysql.query(warbandDateQuery))[0].creationDate;
		// console.log('date', warbandLastDate, warbandLastDate.toISOString(), '' + warbandLastDate);
		const warbandStatsQuery = `
			SELECT * FROM bgs_hero_warband_stats 
			WHERE creationDate = '${warbandLastDate.toISOString()}'
			ORDER BY heroCardId, turn ASC
		`;
		// console.log('prepared query', warbandStatsQuery);
		const warbandDbResults: readonly any[] = await mysql.query(warbandStatsQuery);
		// console.log(
		// 	'executed query',
		// 	warbandDbResults && warbandDbResults.length,
		// 	warbandDbResults && warbandDbResults.length > 0 && warbandDbResults[0],
		// );
		const heroStatsWithWarband = heroStatsWithTribes.map(stat => {
			const relevantInfo = warbandDbResults.filter(warbandStat => warbandStat.heroCardId === stat.id);
			return {
				...stat,
				warbandStats: relevantInfo
					// In the endgame the results are skewed too much by the outliers and by the fact that some heroes never make it there
					.filter(info => info.turn <= 15)
					.map(info => ({
						turn: info.turn,
						totalStats: info.statsDelta,
					})),
			} as BgsGlobalHeroStat;
		});
		// console.log('hero stats with warbnd stats', heroStatsWithWarband);

		const result = {
			heroStats: heroStatsWithWarband,
		} as BgsGlobalStats;

		const response = {
			statusCode: 200,
			isBase64Encoded: false,
			body: JSON.stringify({ result }),
		};
		// console.log('sending back success reponse');
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
