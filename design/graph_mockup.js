const {createCanvas}=require('canvas');const fs=require('fs');
const S=2,W=1720,H=1060,cv=createCanvas(W*S,H*S),x=cv.getContext('2d');x.scale(S,S);
const c={bg:'#0A0D12',bg2:'#0e131b',surf:'#141B24',surf2:'#1b232e',ink:'#E7EDF4',mut:'#9AA6B4',faint:'#5C6675',
 hair:'#242E3B',hairS:'#354150',signal:'#1FDDC9',gold:'#E7B24C',ember:'#FF7A45',
 blue:'#6FA8DC',purple:'#B58BE0',green:'#5FD39A',num:'#8C97A6',red:'#E4736A'};
const SANS='"Noto Sans","DejaVu Sans",sans-serif',MONO='"DejaVu Sans Mono",monospace';
function rr(X,Y,w,h,r){x.beginPath();x.moveTo(X+r,Y);x.arcTo(X+w,Y,X+w,Y+h,r);x.arcTo(X+w,Y+h,X,Y+h,r);x.arcTo(X,Y+h,X,Y,r);x.arcTo(X,Y,X+w,Y,r);x.closePath();}
function T(s,X,Y,sz,col,o){o=o||{};x.font=(o.w||'')+' '+sz+'px '+(o.mono?MONO:SANS);x.fillStyle=col;x.textAlign=o.align||'left';x.textBaseline='alphabetic';x.fillText(s,X,Y);x.textAlign='left';}

// bg
var g=x.createLinearGradient(0,0,0,H);g.addColorStop(0,c.bg2);g.addColorStop(1,c.bg);x.fillStyle=g;x.fillRect(0,0,W,H);
x.fillStyle='rgba(255,255,255,.02)';for(var gx=0;gx<1300;gx+=24)for(var gy=110;gy<H;gy+=24)x.fillRect(gx,gy,1.3,1.3);

// header
T('APEX·ARENA',44,44,26,c.ink,{w:'700'});x.font='700 26px '+SANS;var wm=x.measureText('APEX·ARENA').width;
T('/ ALGORITHM GRAPH',44+wm+14,44,15,c.faint,{w:'600',mono:true});
T('Wire small compute nodes into your driving algorithm — nodes = ROS nodes, wires = typed topics. Probe any wire · open any node.',44,66,13.5,c.mut);
x.strokeStyle=c.hair;x.beginPath();x.moveTo(40,86);x.lineTo(1680,86);x.stroke();

// swimlane regions (faint organizing overlay, not rigid)
var LANES=[['PERCEPTION',110,236,c.purple],['PLANNING',238,470,c.gold],['CONTROL',472,markEnd(),c.signal]];
function markEnd(){return 640;}
LANES.forEach(function(l){x.fillStyle='rgba(255,255,255,.015)';rr(44,l[1],1250,l[2]-l[1]-6,10);x.fill();
 T(l[0],56,l[1]+20,11,l[3],{w:'700',mono:true,});x.globalAlpha=.5;T('region (optional)',56,l[1]+36,10,c.faint,{mono:true});x.globalAlpha=1;});

// ---------- node framework ----------
var NODES={};
function N(id,X,Y,w,title,tcol,ins,outs){var h=26+16+Math.max(ins.length,outs.length,1)*22+6;NODES[id]={id:id,x:X,y:Y,w:w,h:h,title:title,tcol:tcol,ins:ins,outs:outs};}
function port(id,side,i){var n=NODES[id];return {x: side==='in'?n.x:n.x+n.w, y:n.y+26+18+i*22};}
function typeCol(t){return {pose:c.blue,'ranges[]':c.purple,waypoints:c.gold,num:c.num,point:c.green,vec2:c.green,cmd:c.signal,'μ':c.num}[t]||c.num;}

// sources
N('pose',70,150,150,'Pose  (SLAM)',c.blue,[],[['pose','pose']]);
N('scan',70,250,150,'LiDAR scan',c.purple,[],[['ranges[]','ranges[]']]);
N('wpts',70,350,150,'Track',c.gold,[],[['waypoints','waypoints']]);
N('spd',70,450,150,'Speed',c.signal,[],[['v','num']]);
N('mu',70,545,150,'μ  (grip)',c.num,[],[['μ','μ']]);
// col2
N('near',300,165,158,'Nearest Wpt',c.gold,[['pose','pose'],['wpts','waypoints']],[['idx','num']]);
N('curv',300,360,158,'Curvature ahead',c.gold,[['wpts','waypoints'],['idx','num']],[['κ','num']]);
// col3
N('ld',520,150,158,'Ld = 1.2·v + 3',c.gold,[['v','num']],[['Ld','num']]);
N('look',520,268,158,'Lookahead Point',c.gold,[['idx','num'],['wpts','waypoints'],['Ld','num']],[['pt','point']]);
N('grip',520,432,158,'Grip Speed',c.gold,[['κ','num'],['μ','μ']],[['v_tgt','num']]);
// col4
N('frame',745,175,158,'To Car Frame',c.signal,[['pt','point'],['pose','pose']],[['e','vec2']]);
N('pid',745,432,158,'Speed PID',c.signal,[['v_tgt','num'],['v','num']],[['thr','num']]);
// col5
N('gain',965,300,150,'gain = 1.0',c.signal,[],[['g','num']]);
N('steer',965,175,158,'Pursuit → steer',c.signal,[['e','vec2'],['g','num']],[['st','num']]);
// sinks
N('outS',1185,190,120,'STEER ▸',c.signal,[['st','num']],[]);
N('outT',1185,432,120,'THROTTLE ▸',c.signal,[['thr','num']],[]);
// subgraph (preset = editable)
N('ftg',300,545,240,'Follow-the-Gap  ⧉ subgraph',c.ember,[['scan','ranges[]']],[['steer','num']]);

// ---------- wires ----------
var WIRES=[
 ['pose','pose',0,'near','pose',0],['wpts','waypoints',0,'near','wpts',1],
 ['near','idx',0,'curv','idx',1],['wpts','waypoints',0,'curv','wpts',0],
 ['spd','v',0,'ld','v',0],
 ['near','idx',0,'look','idx',0],['wpts','waypoints',0,'look','wpts',1],['ld','Ld',0,'look','Ld',2],
 ['curv','κ',0,'grip','κ',0],['mu','μ',0,'grip','μ',1],
 ['look','pt',0,'frame','pt',0],['pose','pose',0,'frame','pose',1],
 ['grip','v_tgt',0,'pid','v_tgt',0],['spd','v',0,'pid','v',1],
 ['frame','e',0,'steer','e',0],['gain','g',0,'steer','g',1],
 ['steer','st',0,'outS','st',0],['pid','thr',0,'outT','thr',0]
];
function wire(a,ap,ai,b,bp,bi,col,dash){var p1=port(a,'out',ai),p2=port(b,'in',bi);
 x.strokeStyle=col;x.lineWidth=2;if(dash)x.setLineDash([6,5]);
 var midx=(p1.x+p2.x)/2;x.beginPath();x.moveTo(p1.x,p1.y);x.bezierCurveTo(midx,p1.y,midx,p2.y,p2.x,p2.y);x.stroke();x.setLineDash([]);}
WIRES.forEach(function(w){var col=typeCol(NODES[w[0]].outs[w[2]][1]);x.globalAlpha=.75;wire(w[0],w[1],w[2],w[3],w[4],w[5],col);x.globalAlpha=1;});
// ftg alt wire (faded)
x.globalAlpha=.5;wire('scan','ranges[]',0,'ftg','scan',0,c.purple,true);x.globalAlpha=1;

// ---------- draw nodes ----------
function drawNode(n){
 var alt=n.id==='ftg';
 rr(n.x,n.y,n.w,n.h,9);x.fillStyle=c.surf2;x.fill();x.strokeStyle=alt?c.ember:c.hairS;if(alt)x.setLineDash([6,4]);x.lineWidth=1.2;x.stroke();x.setLineDash([]);
 // title bar
 rr(n.x,n.y,n.w,26,9);x.fillStyle='rgba(255,255,255,.04)';x.fill();
 x.fillStyle=n.tcol;rr(n.x+10,n.y+9,7,7,2);x.fill();
 T(n.title,n.x+24,n.y+18,11.5,c.ink,{w:'600'});
 // ports
 n.ins.forEach(function(p,i){var py=n.y+26+18+i*22;x.fillStyle=typeCol(p[1]);x.beginPath();x.arc(n.x,py,4.5,0,7);x.fill();x.strokeStyle=c.bg;x.lineWidth=1.5;x.stroke();
  T(p[0],n.x+11,py+4,10.5,c.mut,{mono:true});});
 n.outs.forEach(function(p,i){var py=n.y+26+18+i*22;x.fillStyle=typeCol(p[1]);x.beginPath();x.arc(n.x+n.w,py,4.5,0,7);x.fill();x.strokeStyle=c.bg;x.lineWidth=1.5;x.stroke();
  T(p[0],n.x+n.w-11,py+4,10.5,c.ink,{mono:true,align:'right'});});
 if(alt)T('double-click → opens its own graph',n.x+14,n.y+n.h-8,10,c.ember,{mono:true});
}
for(var k in NODES)drawNode(NODES[k]);

// ---------- wire probe (ros2 topic echo / rqt_plot) ----------
(function(){var p=port('grip','out',0);var bx=p.x+40,by=p.y+90;
 x.strokeStyle=c.gold;x.lineWidth=1.2;x.setLineDash([4,3]);x.beginPath();x.moveTo(p.x+8,p.y);x.lineTo(bx+30,by);x.stroke();x.setLineDash([]);
 x.fillStyle=c.gold;x.beginPath();x.arc(p.x+8,p.y,3.5,0,7);x.fill();
 rr(bx,by,182,86,9);x.fillStyle='rgba(10,15,21,.96)';x.fill();x.strokeStyle=c.gold;x.lineWidth=1.3;x.stroke();
 T('WIRE PROBE',bx+12,by+18,10,c.gold,{w:'700',mono:true});
 T('/graph/v_tgt',bx+12,by+34,10.5,c.mut,{mono:true});
 T('12.3',bx+12,by+58,22,c.ink,{w:'700',mono:true});T('m/s',bx+62,by+58,11,c.mut,{mono:true});
 // sparkline
 x.strokeStyle=c.gold;x.lineWidth=1.6;x.beginPath();var sx=bx+96,sw=74;var pts=[15,13,9,11,6,7,4,5,8];for(var i=0;i<pts.length;i++){var px=sx+i/(pts.length-1)*sw,py=by+58-pts[i];if(i===0)x.moveTo(px,py);else x.lineTo(px,py);}x.stroke();
 T('echo · plot',bx+96,by+18,9,c.faint,{mono:true});
})();

// ============================================================ RIGHT panel
var RX=1330,RW=350,RE=RX+RW;
// node library
rr(RX,110,RW,470,12);x.fillStyle=c.surf;x.fill();x.strokeStyle=c.hair;x.lineWidth=1;x.stroke();
T('NODE LIBRARY',RX+18,136,11,c.faint,{w:'700',mono:true});T('drag onto canvas',RE-128,136,10.5,c.faint,{mono:true});
function cat(Y,name,col,items){T(name,RX+18,Y,11,col,{w:'700',mono:true});var px=RX+18,py=Y+14;
 items.forEach(function(it){x.font='11.5px '+SANS;var w=x.measureText(it).width+22;if(px+w>RE-16){px=RX+18;py+=30;}
  rr(px,py,w,23,6);x.fillStyle=c.surf2;x.fill();x.strokeStyle=c.hairS;x.stroke();x.fillStyle=col;x.beginPath();x.arc(px+11,py+11.5,3,0,7);x.fill();
  T(it,px+19,py+15,11.5,c.ink);px+=w+7;});return py+38;}
var py=160;
py=cat(py,'SENSORS',c.blue,['Pose','LiDAR scan','Speed','IMU']);
py=cat(py,'GEOMETRY',c.gold,['Nearest','Lookahead','To Car Frame','Frenet s/d']);
py=cat(py,'CONTROL',c.signal,['PID','Pursuit','Stanley','Clamp']);
py=cat(py,'MATH',c.num,['+ − × ÷','atan2','min / max','abs']);
py=cat(py,'LOGIC',c.red,['if','switch','compare']);
py=cat(py,'OUTPUT',c.signal,['steer','throttle']);

// insight card
rr(RX,596,RW,180,12);x.fillStyle=c.surf;x.fill();x.strokeStyle=c.hair;x.stroke();
T('WHY THIS = CODING, NOT TUNING',RX+18,622,11,c.signal,{w:'700',mono:true});
var lines=[['●','fine-grained nodes = you build the actual math'],
 ['●','probe any wire = live value + plot (topic echo)'],
 ['●','open a node = its own inner graph (fractal)'],
 ['●','presets = editable subgraphs, not black boxes'],
 ['●','same graph → export to Python (later)']];
var ly=648;lines.forEach(function(l){x.fillStyle=c.signal;T(l[0],RX+18,ly,9,c.signal);T(l[1],RX+34,ly,12,c.mut);ly+=25;});

// footer
T('= your ROS world (rqt_graph):',RX+18,816,12,c.mut,{mono:true});
T('  nodes + typed topics.',RX+18,834,12,c.mut,{mono:true});
T('Beginner: open a preset, rewire.',RX+18,860,12,c.mut,{mono:true});
T('Expert: build from blank.',RX+18,878,12,c.mut,{mono:true});

fs.writeFileSync('/tmp/claude-1000/-home-hmcl/ebdcb1e4-c07b-4a77-9562-9c02420401e0/scratchpad/graph_mockup.png',cv.toBuffer('image/png'));console.log('graph mockup written');
