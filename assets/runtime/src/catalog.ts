import { z } from 'zod';
import { AppError } from './store';
export function errorResponse(error: unknown) {
  if (error instanceof AppError) return Response.json({error:{code:error.code,message:error.message}},{status:error.status});
  if (error instanceof z.ZodError) return Response.json({error:{code:'invalid_input',message:'输入不符合约定。',details:error.issues}},{status:400});
  if (error instanceof Error && error.name==='OcpClientValidationError') return Response.json({error:{code:'unsupported_query',message:error.message}},{status:400});
  return Response.json({error:{code:'internal_error',message:'服务暂时无法完成请求。'}},{status:500});
}
