export class BgsGlobalHeroStat {
	id: string;
	popularity: number;
	averagePosition: number;
	top4: number;
	top1: number;
	tribesStat: readonly { tribe: string; percent: number }[];
	warbandStats: readonly { turn: number; totalStats: number }[];
}
