const cron = require('node-cron');

const Canvas = require("@napi-rs/canvas");
const {AttachmentBuilder} = require("discord.js");

class Islander {
	constructor(client){
		this.client = client;
		this.userCooldowns = new Map();
		//start game clock
		//cron.schedule('0 * 0 ? * * *',() => this.GameTick());
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
		console.log(island);
		console.log(island.Wood);
		console.log(island["Wood"]);
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
		addText(ctx, island.Currency.toString() , 160, 42);
		addText(ctx, island.Food.toString(), 375, 42);
		addText(ctx, island.Wood.toString(), 595, 42);
		addText(ctx, island.Stone.toString(), 810, 42);

		return new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'island.png' });
	}

	GameTick(){ 
		/*
		let islands = this.client.prisma.i_Island.findMany();
		islands.forEach(island => {
			
		});
		*/
		// every one minute
		// check building under construction

	}

	getGatherCooldownTime(userid){
		let timespan =Math.floor((client.islander.userCooldowns.get(interaction.user.id) - Date.now()) /60000)
		let hours = Math.floor(timespan / 60)
		let min = timespan % 60
		return hours == 0? min + ' minutes': hours + ' hours and ' + min + ' minutes';            
	}

	gcd(a, b) { //greatest-common-divisor for calculating quick resource reward times
		if (!b) {
			return a;
		}
		return gcd(b, a % b); //recursive
	}
}

function addText(ctx, text, x, y) {
	ctx.font = "28px sans-serif";
	ctx.textAlign = "center";
	ctx.fillStyle = "#fff";
	ctx.fillText(text, x, y);
}

module.exports = Islander;