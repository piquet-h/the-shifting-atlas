export default async function (context, req) {
    context.log('HttpPlayerActions triggered')
    context.res = {
        status: 200,
        body: { message: 'Hello from HttpPlayerActions' }
    }
}
