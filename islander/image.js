const { createCanvas } = require('@napi-rs/canvas')

class Image {
    getIsland(memberID) {
        return new Promise(async function (resolve, reject) {
            let member = await client.islander.GetMemberIsland(memberID);
            let buildings = await client.prisma.i_BuildingLevel.findMany({
                where: {
                    //TClevel:{lte: member.i_Island.i_Building_Island[0].level},
                    BuildingID: { in: member.i_Island.i_Building_Island.map(x => x.BuildingID) }
                }
            });

            let canvas = createCanvas(1000, 700);
            resolve(image);
        });
    }
}

module.exports = Image;