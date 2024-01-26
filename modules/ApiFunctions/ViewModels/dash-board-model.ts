import { PointHistory } from ".prisma/client";

export class RaidVM {
  ID: number;
  Title: string;
  MinPlayers: number;
  CreationTime: Date;
  Status: number;
  Attending: number;
}

export class DashBoardModel {
  dashboardPoints: number;
  raids: RaidVM[];
  pointHistory: PointHistory[];
}
