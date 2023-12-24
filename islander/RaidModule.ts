export class RaidModule {

    async AddUserToRaid( userId: string,  raidId: number){
        //this.SchedulingCreationCheck(raidId);
        return global.client.prisma.raidAttendees.create({
            data: {
                MemberId: userId,
                RaidId: raidId
            }
        });
    }

    async SchedulingCreationCheck(raidId: number){
        let raid = await global.client.prisma.raids.findFirst({
                include: {
                    RaidAttendees: true
                },
                where: {
                    ID: raidId,
                    Status: 1
                }
            });

        if(raid == null){
            console.log("Raid not found");
            return;
        }

        if(raid.RaidAttendees.length >= raid.MinPlayers){
            console.log("Raid is full");


            return;
        }
    }


}
