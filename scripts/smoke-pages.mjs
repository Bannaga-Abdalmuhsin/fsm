import {createServer} from 'vite';
const server=await createServer({configFile:'vite.pages.config.ts',server:{middlewareMode:true}});
try{const {smoke}=await server.ssrLoadModule('/smoke.tsx');console.log(smoke());}finally{await server.close();}
