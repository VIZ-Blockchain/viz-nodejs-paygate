#!/usr/bin/env node
const options=require('./options.js');
const mongo=require('mongodb').MongoClient;
const viz_helper=require('./viz_helper.js');

var mongo_url='mongodb://cryptostorm:blabla@localhost:27017/?authSource=admin';
mongo.connect(options.mongodb.url,{useNewUrlParser:true},function(err,client){
	if(err){return console.dir(err);}
	const db=client.db(options.mongodb.database);
	viz=new viz_helper(options.viz,db);
	viz.select_best_gate();
	client.close();
});