/**
 * Domain exceptions for repository operations.
 */

export {
    CosmosException,
    NotFoundException,
    ConcurrencyException,
    RetryableException,
    PreconditionFailedException,
    ValidationException,
    translateCosmosError
} from './cosmosExceptions.js'
