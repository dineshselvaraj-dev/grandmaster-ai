class Engine {
    constructor(onUpdate) {
        this.onUpdate = onUpdate;
        this.multiPV = 3;
        this.depth = 18;
        this.lines = {};
        this.startTime = 0;
        this.worker = null;
        this.currentEngine = 'stockfish';
        this.analysisResolve = null;
        this.sideToMove = 'w';
        
        this.loadEngine('stockfish');
    }
    
    loadEngine(engineName) {
        if (this.worker) {
            this.worker.terminate();
        }
        
        this.currentEngine = engineName;
        
        if (engineName === 'stockfish') {
            this.worker = new Worker('stockfish11.js');
        } else if (engineName === 'komodo') {
            this.worker = new Worker('komodo.js');
        }
        
        this.worker.onmessage = this.onMessage.bind(this);
        this.init();
    }

    init() {
        this.send('uci');
        this.send('isready');
        this.setOption('MultiPV', this.multiPV);
        this.setOption('Threads', 2);
        this.setOption('Hash', 64);
    }

    send(cmd) {
        this.worker.postMessage(cmd);
    }

    setOption(name, value) {
        this.send(`setoption name ${name} value ${value}`);
    }
    
    setStyle(style) {
        this.currentStyle = style;
    }
    
    applyStyle(style) {
        if (!style) style = 'Default';
        const styles = {
            'Default': { 'Contempt': 0, 'Skill Level': 20, 'Personality': 'Default' },
            'Aggressive': { 'Contempt': 100, 'Skill Level': 20, 'Personality': 'Aggressive' },
            'Defensive': { 'Contempt': -50, 'Skill Level': 20, 'Personality': 'Defensive' },
            'Active': { 'Contempt': 50, 'Skill Level': 20, 'Personality': 'Active' },
            'Positional': { 'Contempt': 0, 'Skill Level': 20, 'Personality': 'Positional' },
            'Endgame': { 'Contempt': 0, 'Skill Level': 20, 'Personality': 'Endgame' },
            'Beginner': { 'Contempt': 0, 'Skill Level': 0, 'Personality': 'Beginner' },
            'Human': { 'Contempt': 0, 'Skill Level': 10, 'Personality': 'Human' }
        };
        const s = styles[style] || styles['Default'];
        
        if (this.currentEngine === 'stockfish') {
            if (s['Contempt'] !== undefined) this.setOption('Contempt', s['Contempt']);
            if (s['Skill Level'] !== undefined) this.setOption('Skill Level', s['Skill Level']);
        } else if (this.currentEngine === 'komodo') {
            if (s['Personality']) this.setOption('Personality', s['Personality']);
            this.send('setoption name UCI_LimitStrength value true');
            let elo = 3500;
            if (style === 'Beginner') elo = 800;
            if (style === 'Human') elo = 1500;
            this.send(`setoption name UCI_Elo value ${elo}`);
        }
    }

    onMessage(event) {
        const line = event.data;
        if (typeof line !== 'string') return;
        
        if (line.startsWith('info') && line.includes(' pv ') && line.includes('multipv')) {
            const depthMatch = line.match(/depth (\d+)/);
            const multipvMatch = line.match(/multipv (\d+)/);
            const scoreCpMatch = line.match(/score cp (-?\d+)/);
            const scoreMateMatch = line.match(/score mate (-?\d+)/);
            const pvMatch = line.match(/ pv (.*)/);
            
            if (depthMatch && multipvMatch && pvMatch) {
                const depth = parseInt(depthMatch[1]);
                const multipv = parseInt(multipvMatch[1]);
                const pv = pvMatch[1];
                
                let score = { type: 'cp', value: 0 };
                if (scoreCpMatch) score = { type: 'cp', value: parseInt(scoreCpMatch[1]) };
                if (scoreMateMatch) score = { type: 'mate', value: parseInt(scoreMateMatch[1]) };
                
                // Adjust score relative to absolute white advantage for sorting later
                if (this.sideToMove === 'b') {
                    score.value = -score.value;
                }
                
                this.lines[multipv] = { depth, score, pv };
            }
        }
        
        if (line.startsWith('bestmove')) {
            if (this.analysisResolve) {
                const elapsed = (Date.now() - this.startTime) / 1000;
                
                // Unflip score for the UI if needed
                for (let key in this.lines) {
                    if (this.sideToMove === 'b') {
                        this.lines[key].score.value = -this.lines[key].score.value;
                    }
                }
                
                this.analysisResolve(Object.values(this.lines), elapsed);
                this.analysisResolve = null;
            }
        }
    }

    analyze(fen, depth, multiPV) {
        return new Promise((resolve) => {
            this.send('stop');
            this.depth = depth;
            if (this.multiPV !== multiPV) {
                this.multiPV = multiPV;
                this.setOption('MultiPV', this.multiPV);
            }
            this.lines = {};
            this.startTime = Date.now();
            this.sideToMove = fen.split(' ')[1];
            this.analysisResolve = resolve;
            
            this.send('isready');
            this.applyStyle(this.currentStyle);
            
            this.send(`position fen ${fen}`);
            // Use the depth slider directly, let the engine emit bestmove naturally
            this.send(`go depth ${depth}`);
        });
    }
    
    stop() {
        this.send('stop');
    }
}
