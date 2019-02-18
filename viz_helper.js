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

module.exports=class viz_helper{
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
