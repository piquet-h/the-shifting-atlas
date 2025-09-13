export default async function (context, req) {
    context.log('Website API HealthCheck called')
    context.res = {
        status: 200,
        body: { status: 'ok', service: 'the-shifting-atlas-website-api' }
    }
}
