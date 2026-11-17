import { PointHistory } from ".prisma/client";

/** A raid as the website dashboard shows it. Nullable where the Raids columns are. */
export interface RaidVM {
  ID: number;
  Title: string | null;
  MinPlayers: number | null;
  CreationTime: Date | null;
  Status: number | null;
  Attending: number;
}

export interface DashBoardModel {
  dashboardPoints: number;
  raids: RaidVM[];
  pointHistory: PointHistory[];
}
