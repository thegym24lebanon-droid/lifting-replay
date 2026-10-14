import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
export default defineConfig({
  base: './',
  plugins: [{
    name: 'deployment-version',
    generateBundle() {
      this.emitFile({type:'asset',fileName:'version.json',source:JSON.stringify({commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),release:'civr12'})+'\n'});
    }
  }]
});
