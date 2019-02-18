#!/usr/bin/env node
"use strict";
var viz=require('viz-world-js');
var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var WebSocket = require('websocket').w3cwebsocket;
var options;
var mongodb;
var jsonrpc_gate='';
var best_gate=-1;
var best_gate_latency=-1;
var best_gate_block_num=-1;
var working=false;
var processing=false;
var current_block=1;
var parse_block=1;

module.exports=class viz_helper{
	auto_increment(collection,inc=true,callback){
		mongodb.collection('auto_increment').findOne({_id:collection},function(e,r){
			if(e){
				callback(false);
			}
			let result=0;
			if(typeof r !== 'undefined'){
				if(null===r){
					if(inc){
						mongodb.collection('auto_increment').insertOne({_id:collection,count:1},function(e,r){
							if(!e){
								result=1;
							}
							else{
								result=false;
							}
							callback(result);
						});
					}
					else{
						callback(false);
					}
				}
				else{
					result=r.count;
					if(inc){
						result++;
						mongodb.collection('auto_increment').updateOne({_id:collection},{$set:{count:result}},function(e,r){
							if(e){
								callback(false);
							}
							callback(result);
						});
					}
					else{
						callback(result);
					}
				}
			}
		});
	}
	process_block(){
		var _this=this;
		if(!processing){
			processing=true;
		}
		var process_success=function(){
			current_block++;
			processing=false;
			if(current_block<parse_block){
				setTimeout(()=>{_this.process_block()},100);
			}
		}
		var process_failure=function(){
			processing=false;
		}
		let current_block_request=current_block;
		viz.api.getOpsInBlock(current_block,0,function(e,r){
			if(e){
				process_failure();
			}
			else{
				if(current_block_request==current_block){
					console.log('Parse block '+current_block+options.paygate_account);
					for(let i in r){
						let op_name=r[i].op[0];
						if(op_name=='transfer'){
							let op_data=r[i].op[1];
							let trx_id=r[i].trx_id;
							if(op_data.to==options.paygate_account){
								console.log('Find '+op_name+' trx_id:'+r[i].trx_id+' in block '+current_block_request+' with data: '+JSON.stringify(op_data));
								_this.auto_increment('viz_income',true,function(id){
									if(!id){
										console.log('Error mongodb auto increment viz_income '+op_name+' trx_id:'+r[i].trx_id+' in block '+current_block_request+' with data: '+JSON.stringify(op_data));
									}
									else{
										let transfer={_id:id,status:0,from:op_data.from,amount:parseInt(parseFloat(op_data.amount.substr(0,op_data.amount.indexOf(' ')))*1000),memo:op_data.memo,block:current_block_request,trx_id:trx_id};
										mongodb.collection('viz_income').insertOne(transfer,function(e,r){
											if(e){
												console.log('Error mongodb viz_income '+op_name+' trx_id:'+trx_id+' in block '+current_block_request+' with data: '+JSON.stringify(op_data));
											}
											else{
												console.log('Success mongodb viz_income '+op_name+' trx_id:'+trx_id+' in block '+current_block_request+' with data: '+JSON.stringify(op_data));
											}
										});
									}
								});

							}
						}
					}
					process_success();
				}
				else{
					console.log('Process block glich, current_block_request: '+current_block_request+' not equal current_block: '+current_block+' ignoring respond');
					process_failure();
				}
			}
		});

	}
	check_waterfall(check_parse_block){
		var _this=this;
		if(parse_block==check_parse_block){
			console.log('Check parse block fail, restart working waterfall...');
			working=false;
			this.select_best_gate();
			setTimeout(()=>{
				_this.start();
			},5000);
		}
	}
	waterfall(){
		var _this=this;
		console.log('Waterfall... parse_block: '+parse_block);
		let check_parse_block=parse_block;
		setTimeout(()=>{_this.check_waterfall(check_parse_block)},15000);
		viz.api.getDynamicGlobalProperties(function(e,r){
			if(!e){
				if('irreversible'==options.parsing_mode){
					if(parse_block<r.last_irreversible_block_num){
						parse_block=r.last_irreversible_block_num;
					}
				}
				else{
					if(parse_block<r.head_block_number){
						parse_block=r.head_block_number;
					}
				}
				if(current_block<parse_block){
					_this.process_block();
				}
			}
			if(working){
				setTimeout(()=>{_this.waterfall()},3000);
			}
		});
	}
	start(){
		working=true;
		this.waterfall();
	}
	stop(){
		working=false;
	}
	constructor(helper_options,helper_mongodb_database){
		options=helper_options;
		mongodb=helper_mongodb_database;
		jsonrpc_gate=options.jsonrpc_gates[Math.floor(Math.random()*options.jsonrpc_gates.length)];
		viz.config.set('websocket',jsonrpc_gate);
		console.log('Set startup gate by random: '+jsonrpc_gate);
	}
	update_gate(value=false){
		if(false==value){
			jsonrpc_gate=options.jsonrpc_gates[best_gate];
		}
		else{
			jsonrpc_gate=value;
		}
		viz.config.set('websocket',jsonrpc_gate);
	}
	select_best_gate(){
		var _this=this;
		for(let i in options.jsonrpc_gates){
			let current_gate=i;
			let latency_start=new Date().getTime();
			let latency=-1;

			let protocol='websocket';
			let gate_protocol=options.jsonrpc_gates[i].substring(0,options.jsonrpc_gates[i].indexOf(':'));

			if('http'==gate_protocol||'https'==gate_protocol){
				protocol='http';
			}
			if('websocket'==protocol){
				let socket = new WebSocket(options.jsonrpc_gates[i]);
				socket.onmessage=function(event){
					//console.log(event.data);
					let json=JSON.parse(event.data);
					let gate_block_num=json.result.head_block_number;
					latency=new Date().getTime() - latency_start;
					console.log('Tested jsonrpc gate: '+options.jsonrpc_gates[i],'Latency: '+latency,'Block num: '+gate_block_num);
					if(best_gate!=current_gate){
						if((best_gate_latency>latency)||(best_gate==-1)){
							if((gate_block_num>=best_gate_block_num)||(best_gate==-1)){
								best_gate=current_gate;
								best_gate_latency=latency;
								best_gate_block_num=gate_block_num;
								_this.update_gate();
								console.log('Update best gate: '+options.jsonrpc_gates[i]);
							}
						}
					}
					socket.close();
				}
				socket.onopen=function(){
					socket.send('{"id":1,"method":"call","jsonrpc":"2.0","params":["database_api","get_dynamic_global_properties",[]]}');
				};
			}
			if('http'==protocol){
				let xhr = new XMLHttpRequest();
				xhr.open('POST',options.jsonrpc_gates[i]);
				xhr.setRequestHeader('accept','application/json, text/plain, */*');
				xhr.setRequestHeader('content-type','application/json');
				xhr.onreadystatechange = function() {
					if(4==xhr.readyState && 200==xhr.status){
						//console.log(xhr.responseText);
						let json=JSON.parse(xhr.responseText);
						let gate_block_num=json.result.head_block_number;
						latency=new Date().getTime() - latency_start;
						console.log('Tested jsonrpc gate: '+options.jsonrpc_gates[i],'Latency: '+latency,'Block num: '+gate_block_num);
						if(best_gate!=current_gate){
							if((best_gate_latency>latency)||(best_gate==-1)){
								if((gate_block_num>=best_gate_block_num)||(best_gate==-1)){
									best_gate=current_gate;
									best_gate_latency=latency;
									_this.update_gate();
									console.log('Update best gate: '+options.jsonrpc_gates[i]);
								}
							}
						}
					}
				}
				xhr.send('{"id":1,"method":"call","jsonrpc":"2.0","params":["database_api","get_dynamic_global_properties",[]]}');
			}
		}
	}
};
