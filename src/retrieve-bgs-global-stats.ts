/* eslint-disable @typescript-eslint/no-use-before-define */
import { gzipSync } from 'zlib';
import { BgsGlobalHeroStat } from './bgs-global-hero-stat';
import { BgsGlobalStats } from './bgs-global-stats';
import { getConnection } from './db/rds';

// This example demonstrates a NodeJS 8.10 async handler[1], however of course you could use
// the more traditional callback-style handler.
// [1]: https://aws.amazon.com/blogs/compute/node-js-8-10-runtime-now-available-in-aws-lambda/
export default async (event): Promise<any> => {
	try {
		const mysql = await getConnection();

		const allHeroes = await getAllHeroes(mysql);
		const heroStats: readonly BgsGlobalHeroStat[] = await getHeroStats(mysql, allHeroes);
		const tribesDbResults: readonly any[] = await getTribesDbResults(mysql);
		const warbandStatsDbResults: readonly any[] = await getWarbandStatsDbResults(mysql);
		const winrateDbResults: readonly any[] = await getWinrateDbResults(mysql);

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

		const heroStatsWithWarband = heroStatsWithTribes.map(stat => {
			const warbandStatInfo = warbandStatsDbResults.filter(warbandStat => warbandStat.heroCardId === stat.id);
			const winrateInfo = winrateDbResults.filter(warbandStat => warbandStat.heroCardId === stat.id);
			console.log('winrateInfo for', stat.id, winrateInfo);
			return {
				...stat,
				warbandStats: !warbandStatInfo
					? []
					: warbandStatInfo
							// In the endgame the results are skewed too much by the outliers and by the fact that some heroes never make it there
							.filter(info => info.turn <= 15)
							.map(info => ({
								turn: info.turn,
								totalStats: info.statsDelta,
							})),
				combatWinrate: !winrateInfo
					? []
					: winrateInfo
							.filter(info => info.turn <= 18)
							.map(info => ({
								turn: info.turn,
								winrate: info.winrate,
							})),
			} as BgsGlobalHeroStat;
		});
		// console.log('hero stats with warbnd stats', heroStatsWithWarband);

		const result = {
			heroStats: heroStatsWithWarband,
		} as BgsGlobalStats;

		const stringResults = JSON.stringify({ result });
		const gzippedResults = gzipSync(stringResults).toString('base64');
		console.log('compressed', stringResults.length, gzippedResults.length);
		const response = {
			statusCode: 200,
			isBase64Encoded: true,
			body: gzippedResults,
			headers: {
				'Content-Type': 'text/html',
				'Content-Encoding': 'gzip',
			},
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

const getHeroStats = async (mysql, allHeroes: string): Promise<readonly BgsGlobalHeroStat[]> => {
	// Global stats, like popularity, etc.
	const heroStatsQuery = `
			SELECT * FROM bgs_hero_stats 
			WHERE date is NULL
			AND heroCardId in (${allHeroes})
			ORDER BY heroCardId ASC
		`;
	const heroStatsDbResults: readonly any[] = await mysql.query(heroStatsQuery);
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
		} as BgsGlobalHeroStat,
	];
	return heroStats;
};

const getWinrateDbResults = async (mysql): Promise<readonly any[]> => {
	const dateQuery = `
		SELECT creationDate FROM bgs_hero_combat_winrate ORDER BY id desc limit 1
	`;
	const lastDate: Date = (await mysql.query(dateQuery))[0].creationDate;
	const statsQuery = `
		SELECT * FROM bgs_hero_combat_winrate 
		WHERE creationDate = '${lastDate.toISOString()}'
		ORDER BY heroCardId, turn ASC
	`;
	const dbResults: readonly any[] = await mysql.query(statsQuery);
	return dbResults;
};

const getWarbandStatsDbResults = async (mysql): Promise<readonly any[]> => {
	const dateQuery = `
		SELECT creationDate FROM bgs_hero_warband_stats ORDER BY id desc limit 1
	`;
	const lastDate: Date = (await mysql.query(dateQuery))[0].creationDate;
	const statsQuery = `
		SELECT * FROM bgs_hero_warband_stats 
		WHERE creationDate = '${lastDate.toISOString()}'
		ORDER BY heroCardId, turn ASC
	`;
	const dbResults: readonly any[] = await mysql.query(statsQuery);
	return dbResults;
};

const getTribesDbResults = async (mysql): Promise<readonly any[]> => {
	const tribeDateQuery = `
		SELECT creationDate FROM bgs_hero_tribes_at_end ORDER BY id desc limit 1
	`;
	const tribeLastDate: Date = (await mysql.query(tribeDateQuery))[0].creationDate;
	const tribesAtEndStatsQuery = `
		SELECT * FROM bgs_hero_tribes_at_end 
		WHERE creationDate = '${tribeLastDate.toISOString()}'
		ORDER BY heroCardId ASC
	`;
	const tribesDbResults: readonly any[] = await mysql.query(tribesAtEndStatsQuery);
	return tribesDbResults;
};

const getAllHeroes = async (mysql): Promise<string> => {
	// First get the list of active heroes
	const heroesDateQuery = `
		SELECT date FROM bgs_hero_stats WHERE date IS NOT NULL ORDER BY id desc limit 1 
	`;
	const heroesLastDate: Date = (await mysql.query(heroesDateQuery))[0].date;
	const allHeroesQuery = `
		SELECT heroCardId FROM bgs_hero_stats 
		WHERE date = '${heroesLastDate.toISOString()}'
		ORDER BY heroCardId ASC
	`;
	const allHeroesDbResult: readonly any[] = await mysql.query(allHeroesQuery);
	const allHeroes: string = allHeroesDbResult.map(result => `'${result.heroCardId}'`).join(',');
	return allHeroes;
};
