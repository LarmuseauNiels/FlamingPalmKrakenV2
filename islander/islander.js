//const cron = require('node-cron');

const Canvas = require("@napi-rs/canvas");
const {AttachmentBuilder} = require("discord.js");

class Islander {
	constructor(client){
		this.client = client;
		this.userCooldowns = new Map();
	}
	GetMemberIsland( memberID){
		return new Promise(async function(resolve,reject) {
			client.prisma.members.findUnique( {
				where: {
					ID: memberID,
				},
				include: {
					i_Island: {
						include: {
							i_Building_Island: {
								include: {
									i_Building: true,
									i_BuildingLevel: true
								}
							}
						}
					}
				}
			}).then( member => resolve(member));
		 });
	}

	SpawnIsland(memberID){
		return new Promise(async function(resolve,reject) {
			let island = await client.prisma.i_Island.create({
				data:{
					ID: memberID
				}
			});
			resolve(island);
		});
	}

	GetBuildable(memberID){
		return new Promise(async function(resolve,reject) {
			let member = await client.islander.GetMemberIsland(memberID);
			let buildings = await client.prisma.i_BuildingLevel.findMany({
				where:{
					TClevel:{lte: member.i_Island.i_Building_Island[0].level + 1},
					Level: 1,
					BuildingID: {notIn: member.i_Island.i_Building_Island.map(x => x.BuildingID)}
				}
			})
			resolve({ m: member,b: buildings});
		});
	}

	GetUpgradable(memberID){
		return new Promise(async function(resolve,reject) {
			let member = await client.islander.GetMemberIsland(memberID);
			let buildings = await client.prisma.i_BuildingLevel.findMany({
				where:{
					//TClevel:{lte: member.i_Island.i_Building_Island[0].level},
					BuildingID: {in: member.i_Island.i_Building_Island.map(x => x.BuildingID)}
				}
			})
			buildings = buildings.filter(x => x.Level == (member.i_Island.i_Building_Island.find(q => q.BuildingID == x.BuildingID).level)+1)
			resolve({ m: member,b: buildings});
		});
	}

	AddWood(memberID, amount){
		return new Promise(async function(resolve) {
			let island = await client.prisma.i_Island.update({
				where:{
					ID: memberID
				},
				data:{
					Wood: {increment: amount}
				}
			});
			resolve(island);
		});
	}
	AddFood(memberID, amount){
		return new Promise(async function(resolve) {
			let island = await client.prisma.i_Island.update({
				where:{
					ID: memberID
				},
				data:{
					Food: {increment: amount}
				}
			});
			resolve(island);
		});
	}
	AddStone(memberID, amount){
		return new Promise(async function(resolve) {
			let island = await client.prisma.i_Island.update({
				where:{
					ID: memberID
				},
				data:{
					Stone: {increment: amount}
				}
			});
			resolve(island);
		});
	}

	async GetImage(memberID, island){

		let memberIsland = island;
		let canvas = Canvas.createCanvas(950, 650);
		let ctx = canvas.getContext('2d');

		let islandImage = await Canvas.loadImage('sprites/starting.png');
		let header = await Canvas.loadImage('sprites/buttonLong_brown.png');
		let foodIcon = await Canvas.loadImage('sprites/food.png');
		let goldIcon = await Canvas.loadImage('sprites/gold.png');
		let stoneIcon = await Canvas.loadImage('sprites/stone.png');
		let woodIcon = await Canvas.loadImage('sprites/wood.png');

		ctx.drawImage(islandImage, -4, -180, 1000, 1000);
		ctx.drawImage(header, 50, 10, 190, 49);
		ctx.drawImage(header, 265, 10, 190, 49);
		ctx.drawImage(header, 485, 10, 190, 49);
		ctx.drawImage(header, 700, 10, 190, 49);
		ctx.drawImage(goldIcon, 52, 10, 50, 50);
		ctx.drawImage(foodIcon, 270, 10, 50, 50);
		ctx.drawImage(woodIcon, 480, 2, 70, 70);
		ctx.drawImage(stoneIcon, 705, 10, 50, 50);
		addText(ctx, "0", 160, 42);
		addText(ctx, "0", 375, 42);
		addText(ctx, "0", 595, 42);
		addText(ctx, "0", 810, 42);

		return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'island.png' });
	}

	GameTick(){
		//console.log("GameTick");
	}
}

function addText(ctx, text, x, y) {
	ctx.font = "28px sans-serif";
	ctx.textAlign = "center";
	ctx.fillStyle = "#fff";
	ctx.fillText(text, x, y);
}

module.exports = Islander;