export class BgsGlobalHeroStat {
	id: string;
	popularity: number;
	averagePosition: number;
	tribesStat: readonly { tribe: string; percent: number }[];
	warbandStats: readonly { turn: number; totalStats: number }[];
}
