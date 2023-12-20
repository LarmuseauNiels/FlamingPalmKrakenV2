export class RaidModule {

    async AddUserToRaid( userId: string,  raidId: number){
        return global.client.prisma.raidAttendees.create({
            data: {
                MemberId: userId,
                RaidId: raidId
            }
        });
    }

}
