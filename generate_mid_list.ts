//从dd-center的vdb数据生成midList

const { vtbs } = JSON.parse(Deno.readTextFileSync(Deno.args[0]))

const result = []
let index = 0;

for (const item of vtbs) {
    for (const account of item.accounts) {
        // console.log(account)
        if (account.platform === 'bilibili') {
            result.push({
                index: index++,
                name: item.name[item.name.default],
                id: account.id.toString()
            })
        }
    }
}

console.log(JSON.stringify(result, null, 4))