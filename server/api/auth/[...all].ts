import { getStudioAuth } from '../../utils/auth'

export default defineEventHandler(event => getStudioAuth().handler(toWebRequest(event)))
