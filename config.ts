interface Configuration {
    chromePath?: string;
    browserDataPath: string;
    stopAt: number;
    headless: boolean;
    excludeFetched: boolean;
}

export const Config: Configuration = JSON.parse(await Deno.readTextFile(Deno.args[0]))