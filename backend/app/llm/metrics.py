import logging

logger = logging.getLogger("app.llm.metrics")

def calculate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    if not isinstance(prompt_tokens, (int, float)):
        prompt_tokens = 0
    if not isinstance(completion_tokens, (int, float)):
        completion_tokens = 0
        
    model_lower = model.lower()
    if "8b" in model_lower:
        prompt_cost = 0.05
        completion_cost = 0.08
    else:
        prompt_cost = 0.59
        completion_cost = 0.79
    return round((prompt_tokens * prompt_cost + completion_tokens * completion_cost) / 1_000_000, 6)

def log_metrics(
    feature: str,
    video_id: str,
    model: str,
    cache_status: str,
    prompt_tokens: int,
    completion_tokens: int,
    total_tokens: int,
    response_time: float,
):
    if not isinstance(prompt_tokens, (int, float)):
        prompt_tokens = 0
    if not isinstance(completion_tokens, (int, float)):
        completion_tokens = 0
    if not isinstance(total_tokens, (int, float)):
        total_tokens = 0

    cost = calculate_cost(model, prompt_tokens, completion_tokens)
    
    # Format response time cleanly (e.g. 4ms if less than 1s, or in seconds)
    time_str = f"{int(response_time * 1000)}ms" if response_time < 1.0 else f"{response_time:.1f}s"

    log_msg = (
        f"\nFeature: {feature}\n"
        f"Video: {video_id}\n"
        f"Model: {model}\n"
        f"Cache: {cache_status}\n"
        f"Prompt Tokens: {prompt_tokens}\n"
        f"Completion Tokens: {completion_tokens}\n"
        f"Response Time: {time_str}\n"
        f"Estimated Cost: ${cost:.6f}\n"
    )
    # Print or log at INFO level
    logger.info(log_msg)
    print(log_msg)  # Ensure visibility in logs
