import {sprite,tone} from './core.js';
export function stallSprite(color='#b0aaa0',category='other',seed=0) {
  return sprite(112,90,b=>{
    const wood=tone('#bb8864'), c=tone(color);
    b.rect(9,30,3,55,wood.mid);b.rect(99,30,3,55,wood.lo);
    b.rect(6,56,100,12,wood.hi);b.rect(6,68,100,12,wood.mid);b.hline(6,78,100,wood.lo);
    b.rect(12,80,5,7,wood.mid);b.rect(95,80,5,7,wood.lo);
    for(let x=4;x<108;x+=8){b.rect(x,12,8,19,(x/8|0)%2?c.hi:c.mid);b.rect(x,31,8,6,(x/8|0)%2?c.mid:c.lo);}
    b.hline(4,12,104,c.hi);b.rect(18,2,76,9,wood.hi);
    for(let i=0;i<3;i++){const p=productPlaceholder(category,seed+i);const ox=24+i*29;for(let y=18;y<78;y+=4)for(let x=16;x<80;x+=4){const k=(y*96+x)*4;if(p.d[k+3])b.px(ox+(x-16)/4,40+(y-18)/4,'#'+[...p.d.slice(k,k+3)].map(n=>n.toString(16).padStart(2,'0')).join(''));}}
    b.rect(69,60,29,14,'#fff1ce');b.rect(82,74,2,8,wood.lo);
  });
}
export function productPlaceholder(category,seed=0){
  return sprite(96,96,b=>{
    const c=tone(['#e88fab','#70bca8','#ecb94e','#9c8bc4'][Math.abs(seed)%4]);
    if(['ceramic','food','scent'].includes(category)){
      b.rect(29,31,36,40,c.mid);b.oval(47,31,18,6,c.hi);b.oval(47,70,18,5,c.lo);
      if(category==='ceramic'){b.rect(65,39,10,22,c.lo);b.rect(66,43,5,12,'#f9eddb');b.oval(47,31,12,3,'#82624a');}
      if(category==='scent'){b.rect(44,18,4,12,'#73524b');b.oval(46,16,3,6,'#f2b44e');}
      if(category==='food'){b.rect(33,36,28,27,'#edca8c');for(let i=0;i<9;i++)b.rect(36+(i%3)*9,40+Math.floor(i/3)*8,3,3,'#785447');}
    }else if(category==='accessory'){
      for(const x of [31,63]){b.oval(x,31,4,6,'#e6bc4e');b.oval(x,51,10,14,c.mid);b.oval(x-2,48,5,8,c.hi);b.rect(x-1,66,3,8,'#d3a349');}
    }else if(['textile','leather','class'].includes(category)){
      b.rect(28,25,39,22,c.lo);b.rect(34,29,27,16,'#f9eddb');b.rect(22,43,51,32,c.mid);b.rect(23,43,48,4,c.hi);b.rect(66,47,7,28,c.lo);for(let x=28;x<65;x+=7)b.vline(x,50,20,c.hi);
    }else if(category==='wood'){
      b.oval(48,34,15,20,'#c18c59');b.oval(45,31,10,14,'#e6bc81');b.rect(44,47,7,33,'#b37a4e');
    }else{
      b.rect(23,19,50,61,c.lo);b.rect(26,20,44,56,'#fff3ce');b.oval(49,42,13,13,c.mid);b.rect(32,60,31,3,c.mid);b.rect(32,67,22,2,c.lo);
    }
  });
}
export function landmarkSprite(kind){return sprite(112,100,b=>{
  const w=tone('#73b4a4');b.rect(5,12,101,82,w.mid);b.rect(9,25,93,65,w.lo);b.rect(3,9,105,14,'#e9b66e');
  for(let i=0;i<6;i++){const c=tone(['#f19ab6','#eed277','#88c6bb'][i%3]);if(kind==='fabric'){b.rect(13+i*14,28,12,55-i%3*6,c.mid);b.vline(13+i*14,28,55-i%3*6,c.hi);b.vline(23+i*14,28,55-i%3*6,c.lo);}else{for(let j=0;j<4;j++){b.rect(12+i*14,29+j*14,12,12,'#d3ece4');b.oval(18+i*14,35+j*14,3,3,c.mid);}}}
});}
export function streetProp(kind){return sprite(32,64,b=>{
 if(kind==='post'){const c=tone('#cc5149');b.rect(8,24,17,32,c.mid);b.rect(9,21,15,6,c.hi);b.rect(11,30,11,3,c.dk);b.rect(11,54,11,6,c.lo);}
 else if(kind==='lamp'){b.rect(15,15,3,44,'#657c74');b.rect(7,10,13,3,'#657c74');b.rect(6,13,9,5,'#ffe4a0');b.rect(12,58,9,3,'#657c74');}
 else{b.rect(5,3,22,42,'#8c6555');b.rect(7,5,18,37,'#e7a5a5');for(let y=11;y<37;y+=8)b.rect(12,y,8,3,'#fff2d5');}
});}
export function groundTile(){return sprite(32,32,b=>{b.rect(0,0,32,32,'#f4dfc0');b.hline(0,31,32,'#dfc8a7');b.vline(31,0,32,'#e5cfae');b.rect(3,4,2,1,'#fff0d4');},{line:false});}
